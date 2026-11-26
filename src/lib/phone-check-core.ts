// 휴대폰 제출 검사 코어 — 웹 서버 액션(src/actions/phone-check.ts)과 모바일 API
// (/api/mobile/v1/staff/phone-check) 가 같은 조회·저장 로직을 쓴다.
// 인증·권한·revalidatePath 는 호출 측 책임. 칸 판정 규칙은 @/lib/phone-locker.

import type { PhoneCheckStatus } from "@/generated/prisma";
import { periodsFor } from "@/lib/class-periods";
import { compareSeat } from "@/lib/patrol";
import { phoneCheckReference, phoneSlotState, type PhoneSlotState } from "@/lib/phone-locker";
import { prisma } from "@/lib/prisma";
import { offlineStudentWhere } from "@/lib/student-filters";

export type PhoneCheckRow = {
  studentId: string;
  name: string;
  seat: string | null;
  grade: string;
  /** 검사 대상 — 기준 시각에 자리에 있음(state === "HERE"). 폰이 보관함에 있어야 하는 학생 */
  checkedIn: boolean;
  /** 기준 시각에 어디 있었는지 — 자리 · 외출 · 퇴실 · 미입실 */
  state: PhoneSlotState;
  checkInAt: string | null; // "HH:MM" (KST)
  checkOutAt: string | null; // "HH:MM" (KST)
  record: { status: PhoneCheckStatus; note: string | null } | null;
  /** 이날 앞 교시(입실 검사 포함) 중 가장 최근 기록 — 지난 교시 미제출·면제를 이어서 보여 준다 */
  prior: PhoneCheckStatus | null;
};

export type PhoneCheckBoardData = {
  date: string;
  period: number;
  /** 오늘 지금 기준으로 판정했는지 (지난 교시·지난 날은 false) */
  live: boolean;
  rows: PhoneCheckRow[];
  /** 이 교시 마지막 기록 — 언제 · 누가 */
  lastCheck: { at: string; by: string | null } | null;
  /** 이날 기록이 하나라도 있는 교시 (0=입실) */
  checkedPeriods: number[];
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

/** 0=입실 때, 1~=교시. 그 날짜 교시표에 없는 번호는 거절. */
export function parsePhoneCheckPeriod(date: string, period: unknown = 0): number {
  if (period === 0) return 0;
  if (typeof period !== "number" || !periodsFor(date).some((p) => p.no === period)) {
    throw new Error("교시를 확인하세요");
  }
  return period;
}

/**
 * 해당 날짜·교시의 휴대폰 제출 검사 보드: ACTIVE 학생 전체(좌석순) + 자리 판정 + 검사 기록.
 * 자리 판정 기준 시각은 phoneCheckReference — 오늘 지금 교시는 '지금 이 순간'(외출·퇴실 제외).
 * offlineOnly=true 면 온라인 관리 학생을 제외한다(모바일). 웹은 기존 동작 유지(false).
 */
export async function loadPhoneCheckBoard(
  date: string,
  opts: { offlineOnly?: boolean; period?: number; now?: Date } = {},
): Promise<PhoneCheckBoardData> {
  const day = parsePhoneCheckDate(date);
  const period = parsePhoneCheckPeriod(date, opts.period);
  const { ref, live } = phoneCheckReference(date, period, opts.now ?? new Date());

  const [students, attendance, outings, records] = await Promise.all([
    prisma.student.findMany({
      where: opts.offlineOnly ? offlineStudentWhere({ status: "ACTIVE" }) : { status: "ACTIVE" },
      select: { id: true, name: true, seat: true, grade: true },
    }),
    prisma.attendanceRecord.findMany({
      where: { date: day },
      select: { studentId: true, checkIn: true, checkOut: true },
    }),
    prisma.dailyOuting.findMany({
      where: { date: day, outStart: { not: null } },
      select: { studentId: true, outStart: true, outEnd: true },
    }),
    // 이날 기록 전부 (학생 수 × 교시 수 ≈ 900건 이하) — 이 교시 기록 · 앞 교시 이어 보기 · 교시별 진행을 한 번에
    prisma.phoneCheckRecord.findMany({
      where: { date: day },
      select: { studentId: true, period: true, status: true, note: true, checkedById: true, updatedAt: true },
    }),
  ]);

  const attendanceById = new Map(attendance.map((a) => [a.studentId, a]));
  const outingsById = new Map<string, typeof outings>();
  for (const o of outings) outingsById.set(o.studentId, [...(outingsById.get(o.studentId) ?? []), o]);

  const recordById = new Map<string, (typeof records)[number]>();
  const priorById = new Map<string, (typeof records)[number]>();
  const checkedPeriods = new Set<number>();
  let last: (typeof records)[number] | null = null;
  for (const r of records) {
    checkedPeriods.add(r.period);
    if (r.period === period) {
      recordById.set(r.studentId, r);
      if (!last || r.updatedAt > last.updatedAt) last = r;
    } else if (r.period < period) {
      const prev = priorById.get(r.studentId);
      if (!prev || r.period > prev.period) priorById.set(r.studentId, r);
    }
  }

  const checker = last
    ? await prisma.user.findUnique({ where: { id: last.checkedById }, select: { name: true } })
    : null;

  const rows = students.sort(compareSeat).map((s): PhoneCheckRow => {
    const a = attendanceById.get(s.id);
    const state = phoneSlotState(a, outingsById.get(s.id) ?? [], ref);
    const rec = recordById.get(s.id);
    return {
      studentId: s.id,
      name: s.name,
      seat: s.seat,
      grade: s.grade,
      checkedIn: state === "HERE",
      state,
      checkInAt: a?.checkIn ? toKSTHHMM(a.checkIn) : null,
      checkOutAt: a?.checkOut ? toKSTHHMM(a.checkOut) : null,
      record: rec ? { status: rec.status, note: rec.note } : null,
      prior: priorById.get(s.id)?.status ?? null,
    };
  });

  return {
    date,
    period,
    live,
    rows,
    lastCheck: last ? { at: last.updatedAt.toISOString(), by: checker?.name ?? null } : null,
    checkedPeriods: [...checkedPeriods].sort((x, y) => x - y),
  };
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

/** 학생 1명 기록 지우기 — 검사 중에 누른 칸을 다시 눌러 되돌릴 때. */
export async function deletePhoneCheck(studentId: string, date: string, period: number = 0): Promise<void> {
  const day = parsePhoneCheckDate(date);
  const p = parsePhoneCheckPeriod(date, period);
  await prisma.phoneCheckRecord.deleteMany({ where: { studentId, date: day, period: p } });
}

function cleanIds(studentIds: unknown): string[] {
  if (!Array.isArray(studentIds)) throw new Error("학생 목록을 확인하세요");
  return [...new Set(studentIds.filter((id): id is string => typeof id === "string" && !!id))];
}

/**
 * 검사 완료 — 아직 기록이 없는 학생만 제출(·면제)로 기록한다. 처리한 학생 수 반환.
 * 이미 기록된 학생(다른 직원이 방금 누른 칸 포함)은 건드리지 않는다(skipDuplicates).
 */
export async function bulkCreatePhoneChecks(
  date: string,
  ids: { submitted: unknown; exempt?: unknown },
  checkedById: string,
  period: number = 0,
): Promise<number> {
  const day = parsePhoneCheckDate(date);
  const p = parsePhoneCheckPeriod(date, period);
  const submitted = cleanIds(ids.submitted);
  const exempt = ids.exempt === undefined ? [] : cleanIds(ids.exempt).filter((id) => !submitted.includes(id));
  if (submitted.length + exempt.length === 0) return 0;
  if (submitted.length + exempt.length > MAX_BULK_STUDENTS) {
    throw new Error("한 번에 처리할 수 있는 학생 수를 넘었습니다");
  }

  const row = (studentId: string, status: PhoneCheckStatus) => ({ studentId, date: day, period: p, status, checkedById });
  const { count } = await prisma.phoneCheckRecord.createMany({
    data: [...submitted.map((id) => row(id, "SUBMITTED")), ...exempt.map((id) => row(id, "EXEMPT"))],
    skipDuplicates: true,
  });
  return count;
}
