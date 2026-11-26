// 휴대폰 보관함 — 칸 배치(앞에서 본 모습)와 칸 판정. 순수 함수만 둔다.
// 서버(src/lib/phone-check-core.ts)와 웹 화면이 같이 쓰고, 앱(apps/mobile)은 같은 규칙을 따라 옮겨 쓴다.

import type { PhoneCheckStatus } from "@/generated/prisma";
import { currentPeriodNo, periodsFor } from "@/lib/class-periods";
import { TOTAL_SEATS } from "@/lib/seat-layout";

/**
 * 보관함 칸 배치 — 앞에서 본 모습 그대로, 위 선반부터. 값은 좌석 번호(Student.seat), null 은 빈 칸.
 * 줄(선반)마다 칸 수가 달라도 된다.
 */
// ponytail: 원장님 보관함 사진을 받기 전 임시 배치(좌석 1~89 를 5칸씩). 사진을 받으면 이 표만 고친다.
export const PHONE_LOCKER_ROWS: (number | null)[][] = Array.from(
  { length: Math.ceil(TOTAL_SEATS / 5) },
  (_, r) => Array.from({ length: 5 }, (_, c) => (r * 5 + c + 1 <= TOTAL_SEATS ? r * 5 + c + 1 : null)),
);

/** 기준 시각에 학생이 어디 있는지 — 자리에 있음 · 외출 중 · 퇴실 · 미입실 */
export type PhoneSlotState = "HERE" | "OUTING" | "LEFT" | "NONE";

type Span = { checkIn: Date | null; checkOut: Date | null } | undefined;
type Outing = { outStart: Date | null; outEnd: Date | null };

const KST = 9 * 60 * 60 * 1000;
const CHECK_DELAY_MS = 10 * 60 * 1000;

/**
 * 판정 기준 시각(ms)과 실시간 여부.
 *  - 오늘의 입실 검사·지금 교시(와 아직 안 온 교시): 지금 이 순간 (live)
 *  - 지난 교시: 그 교시 시작 10분 뒤 — 교시가 시작하면 바로 도는 검사 시점
 *  - 지난 날의 입실 검사: null — 그날 입실했는지만 본다
 */
export function phoneCheckReference(date: string, period: number, now: Date): { ref: number | null; live: boolean } {
  const kst = new Date(now.getTime() + KST).toISOString();
  const today = kst.slice(0, 10);
  if (date === today && (period === 0 || period >= currentPeriodNo(date, kst.slice(11, 16)))) {
    return { ref: now.getTime(), live: true };
  }
  const slot = periodsFor(date).find((p) => p.no === period);
  if (!slot) return { ref: null, live: false };
  return { ref: Date.parse(`${date}T${slot.start}:00+09:00`) + CHECK_DELAY_MS, live: false };
}

/** 기준 시각에 학생이 어디 있었는지. 순찰의 '지금 자리에 있어야 할 학생'(patrol-round.ts)과 같은 기준. */
export function phoneSlotState(span: Span, outings: Outing[], ref: number | null): PhoneSlotState {
  if (!span?.checkIn) return "NONE";
  if (ref === null) return "HERE";
  if (span.checkIn.getTime() > ref) return "NONE";
  if (span.checkOut && span.checkOut.getTime() <= ref) return "LEFT";
  const out = outings.some(
    (o) => o.outStart && o.outStart.getTime() <= ref && (!o.outEnd || o.outEnd.getTime() > ref),
  );
  return out ? "OUTING" : "HERE";
}

/**
 * 칸 하나의 모습.
 *  todo    폰이 있어야 하는데 아직 기록 없음 (검사 대상)
 *  ok      제출 확인됨
 *  exempt  면제 (기록 또는 앞 교시 면제를 이어 받음)
 *  missing 다른 칸 — 있어야 하는데 없음 (미제출)
 *  away    비어 있어야 함 (미입실·외출·퇴실)
 *  extra   다른 칸 — 비어 있어야 하는데 폰이 있음
 */
export type SlotKind = "todo" | "ok" | "exempt" | "missing" | "away" | "extra";

type SlotRow = {
  checkedIn: boolean;
  record: { status: PhoneCheckStatus } | null;
  prior: PhoneCheckStatus | null;
};

export function slotKind(r: SlotRow): SlotKind {
  const st = r.record?.status;
  if (!r.checkedIn) return st === "SUBMITTED" ? "extra" : "away";
  if (st === "NOT_SUBMITTED") return "missing";
  if (st === "EXEMPT" || (!st && r.prior === "EXEMPT")) return "exempt";
  if (st === "SUBMITTED") return "ok";
  return "todo";
}

/** 다른 칸(실제와 기록이 다른 칸)인지 */
export const isMismatch = (k: SlotKind) => k === "missing" || k === "extra";

/** 검사 완료 때 기록할 학생 — 자리에 있는데 아직 기록이 없는 학생. 앞 교시에 면제였으면 면제를 이어 간다. */
export function completionTargets(rows: (SlotRow & { studentId: string })[]): {
  submitted: string[];
  exempt: string[];
} {
  const submitted: string[] = [];
  const exempt: string[] = [];
  for (const r of rows) {
    if (!r.checkedIn || r.record) continue;
    (r.prior === "EXEMPT" ? exempt : submitted).push(r.studentId);
  }
  return { submitted, exempt };
}
