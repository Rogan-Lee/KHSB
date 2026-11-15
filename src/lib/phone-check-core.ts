// 휴대폰 제출 검사 코어 — 웹 서버 액션(src/actions/phone-check.ts)과 모바일 API
// (/api/mobile/v1/staff/phone-check) 가 같은 조회·저장 로직을 쓴다.
// 인증·권한·revalidatePath 는 호출 측 책임.

import type { PhoneCheckStatus } from "@/generated/prisma";
import { periodsFor } from "@/lib/class-periods";
import { compareSeat } from "@/lib/patrol";
import { prisma } from "@/lib/prisma";
import { offlineStudentWhere } from "@/lib/student-filters";

export type PhoneCheckRow = {
  studentId: string;
  name: string;
  seat: string | null;
  grade: string;
  checkedIn: boolean; // 0교시=오늘 입실함, 교시=그 교시에 자리에 있었음(입실~퇴실이 교시와 겹침)
  checkInAt: string | null; // "HH:MM" (KST)
  checkOutAt: string | null; // "HH:MM" (KST)
  record: { status: PhoneCheckStatus; note: string | null } | null;
};

const MAX_NOTE_LEN = 200;
const MAX_BULK_STUDENTS = 1000;

/** "YYYY-MM-DD" → @db.Date 저장 규약(UTC 자정)에 맞는 Date. 형식 검증 포함. */
export function parsePhoneCheckDate(date: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("잘못된 날짜 형식입니다");
  return new Date(date);
}

function toKSTHHMM(d: Date): string {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(11, 16);
}

/** "YYYY-MM-DD" + "HH:MM"(24:00 허용) KST → epoch ms. 자정 넘긴 퇴실과도 비교되게 문자열 대신 시각으로. */
function kstAt(date: string, hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return Date.parse(`${date}T00:00:00+09:00`) + (h * 60 + m) * 60_000;
}

/** 0=입실 때, 1~=교시. 그 날짜 교시표에 없는 번호는 거절. */
export function parsePhoneCheckPeriod(date: string, period: unknown = 0): number {
  if (period === 0) return 0;
  if (typeof period !== "number" || !periodsFor(date).some((p) => p.no === period)) {
    throw new Error("교시를 확인하세요");
  }
  return period;
}

/**
 * 해당 날짜의 휴대폰 제출 검사 보드: ACTIVE 학생 전체(좌석순) + 입실 여부 + 검사 기록.
 * offlineOnly=true 면 온라인 관리 학생을 제외한다(모바일). 웹은 기존 동작 유지(false).
 */
export async function loadPhoneCheckBoard(
  date: string,
  opts: { offlineOnly?: boolean; period?: number } = {},
): Promise<PhoneCheckRow[]> {
  const day = parsePhoneCheckDate(date);
  const period = parsePhoneCheckPeriod(date, opts.period);
  const slot = periodsFor(date).find((p) => p.no === period);

  const [students, attendance, records] = await Promise.all([
    prisma.student.findMany({
      where: opts.offlineOnly ? offlineStudentWhere({ status: "ACTIVE" }) : { status: "ACTIVE" },
      select: { id: true, name: true, seat: true, grade: true },
    }),
    prisma.attendanceRecord.findMany({
      where: { date: day },
      select: { studentId: true, checkIn: true, checkOut: true },
    }),
    prisma.phoneCheckRecord.findMany({
      where: { date: day, period },
      select: { studentId: true, status: true, note: true },
    }),
  ]);

  const attendanceById = new Map(attendance.map((a) => [a.studentId, a]));
  const recordById = new Map(records.map((r) => [r.studentId, r]));

  return students.sort(compareSeat).map((s) => {
    const a = attendanceById.get(s.id);
    const checkIn = a?.checkIn ?? null;
    const rec = recordById.get(s.id);
    // 교시: 그 교시가 끝나기 전에 입실했고, 시작 전에 퇴실하지 않았으면 자리에 있던 것
    const present =
      !!checkIn &&
      (!slot ||
        (checkIn.getTime() < kstAt(date, slot.end) &&
          (!a?.checkOut || a.checkOut.getTime() > kstAt(date, slot.start))));
    return {
      studentId: s.id,
      name: s.name,
      seat: s.seat,
      grade: s.grade,
      checkedIn: present,
      checkInAt: checkIn ? toKSTHHMM(checkIn) : null,
      checkOutAt: a?.checkOut ? toKSTHHMM(a.checkOut) : null,
      record: rec ? { status: rec.status, note: rec.note } : null,
    };
  });
}

/** 학생 1명 검사 상태 upsert. */
export async function upsertPhoneCheck(input: {
  studentId: string;
  date: string;
  status: PhoneCheckStatus;
  note?: string | null;
  checkedById: string;
  period?: number;
}): Promise<void> {
  const day = parsePhoneCheckDate(input.date);
  const period = parsePhoneCheckPeriod(input.date, input.period);
  // 웹 액션은 note 를 검증 없이 넘기므로 코어에서 문자열·길이를 정리 (모바일은 200자 검증 후 호출)
  const trimmed =
    typeof input.note === "string" ? input.note.trim().slice(0, MAX_NOTE_LEN) || null : null;

  await prisma.phoneCheckRecord.upsert({
    where: { studentId_date_period: { studentId: input.studentId, date: day, period } },
    create: {
      studentId: input.studentId,
      date: day,
      period,
      status: input.status,
      note: trimmed,
      checkedById: input.checkedById,
    },
    update: { status: input.status, note: trimmed, checkedById: input.checkedById },
  });
}

/** 다건 제출 처리 (입실자 일괄 제출용). 처리한 학생 수 반환. */
export async function bulkUpsertPhoneSubmitted(
  date: string,
  studentIds: string[],
  checkedById: string,
  period: number = 0,
): Promise<number> {
  const day = parsePhoneCheckDate(date);
  const p = parsePhoneCheckPeriod(date, period);
  if (!Array.isArray(studentIds)) throw new Error("학생 목록을 확인하세요");
  const ids = [...new Set(studentIds.filter((id): id is string => typeof id === "string" && !!id))];
  if (ids.length === 0) return 0;
  if (ids.length > MAX_BULK_STUDENTS) throw new Error("한 번에 처리할 수 있는 학생 수를 넘었습니다");

  await prisma.$transaction(
    ids.map((studentId) =>
      prisma.phoneCheckRecord.upsert({
        where: { studentId_date_period: { studentId, date: day, period: p } },
        create: { studentId, date: day, period: p, status: "SUBMITTED", checkedById },
        update: { status: "SUBMITTED", note: null, checkedById },
      }),
    ),
  );
  return ids.length;
}
