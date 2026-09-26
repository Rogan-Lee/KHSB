// 휴대폰 제출 검사 코어 — 웹 서버 액션(src/actions/phone-check.ts)과 모바일 API
// (/api/mobile/v1/staff/phone-check) 가 같은 조회·저장 로직을 쓴다.
// 인증·권한·revalidatePath 는 호출 측 책임.

import type { PhoneCheckStatus } from "@/generated/prisma";
import { compareSeat } from "@/lib/patrol";
import { prisma } from "@/lib/prisma";
import { offlineStudentWhere } from "@/lib/student-filters";

export type PhoneCheckRow = {
  studentId: string;
  name: string;
  seat: string | null;
  grade: string;
  checkedIn: boolean;
  checkInAt: string | null; // "HH:MM" (KST)
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

/**
 * 해당 날짜의 휴대폰 제출 검사 보드: ACTIVE 학생 전체(좌석순) + 입실 여부 + 검사 기록.
 * offlineOnly=true 면 온라인 관리 학생을 제외한다(모바일). 웹은 기존 동작 유지(false).
 */
export async function loadPhoneCheckBoard(
  date: string,
  opts: { offlineOnly?: boolean } = {},
): Promise<PhoneCheckRow[]> {
  const day = parsePhoneCheckDate(date);

  const [students, attendance, records] = await Promise.all([
    prisma.student.findMany({
      where: opts.offlineOnly ? offlineStudentWhere({ status: "ACTIVE" }) : { status: "ACTIVE" },
      select: { id: true, name: true, seat: true, grade: true },
    }),
    prisma.attendanceRecord.findMany({
      where: { date: day },
      select: { studentId: true, checkIn: true },
    }),
    prisma.phoneCheckRecord.findMany({
      where: { date: day },
      select: { studentId: true, status: true, note: true },
    }),
  ]);

  const checkInById = new Map(attendance.map((a) => [a.studentId, a.checkIn]));
  const recordById = new Map(records.map((r) => [r.studentId, r]));

  return students.sort(compareSeat).map((s) => {
    const checkIn = checkInById.get(s.id) ?? null;
    const rec = recordById.get(s.id);
    return {
      studentId: s.id,
      name: s.name,
      seat: s.seat,
      grade: s.grade,
      checkedIn: !!checkIn,
      checkInAt: checkIn ? toKSTHHMM(checkIn) : null,
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
}): Promise<void> {
  const day = parsePhoneCheckDate(input.date);
  // 웹 액션은 note 를 검증 없이 넘기므로 코어에서 문자열·길이를 정리 (모바일은 200자 검증 후 호출)
  const trimmed =
    typeof input.note === "string" ? input.note.trim().slice(0, MAX_NOTE_LEN) || null : null;

  await prisma.phoneCheckRecord.upsert({
    where: { studentId_date: { studentId: input.studentId, date: day } },
    create: {
      studentId: input.studentId,
      date: day,
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
): Promise<number> {
  const day = parsePhoneCheckDate(date);
  if (!Array.isArray(studentIds)) throw new Error("학생 목록을 확인하세요");
  const ids = [...new Set(studentIds.filter((id): id is string => typeof id === "string" && !!id))];
  if (ids.length === 0) return 0;
  if (ids.length > MAX_BULK_STUDENTS) throw new Error("한 번에 처리할 수 있는 학생 수를 넘었습니다");

  await prisma.$transaction(
    ids.map((studentId) =>
      prisma.phoneCheckRecord.upsert({
        where: { studentId_date: { studentId, date: day } },
        create: { studentId, date: day, status: "SUBMITTED", checkedById },
        update: { status: "SUBMITTED", note: null, checkedById },
      }),
    ),
  );
  return ids.length;
}
