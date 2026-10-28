// 청구 일정 — 학생마다 "다음에 낼 청구서"(기간·금액·자동 발행일·막힌 이유)를 계산한다.
// 수강료 화면의 "청구 일정"과 매일 자동 청구(cron)가 같은 계산을 쓴다 — 화면에서 확인 필요로 보이는 학생은 자동으로 나가지 않는다.
// 등록 기준은 매월 1일~말일 (산식은 pricing.ts):
//  · 1일에 시작하면 한 달(세 달 선등록이면 세 달) 전액
//  · 달 중간에 시작하면 그달 말일까지 일할 — 15일 이후면 다음 달 한 달까지 한 청구서로
// 순수 함수 (DB 를 읽지 않는다). 입력 모으기는 schedule-data.ts.

import {
  addDays,
  AUTO_ISSUE_GRACE_DAYS,
  calcInvoiceAmount,
  calendarPeriodEnd,
  diffDays,
  monthEndOf,
} from "@/lib/tuition/calc";
import { proratedChargeOf, type TuitionPlan, type TuitionPricing } from "@/lib/tuition/pricing";

/** 자동 발행을 막는 이유 — 하나라도 있으면 화면에 "확인 필요"로 올리고 자동으로 내지 않는다 */
export type ScheduleBlocker =
  /** 운영진이 보류해 두었다 (사유는 학생 수강료 정보에) */
  | "HOLD"
  /** 시스템을 쓰기 전부터 다녔는데 낸 기록이 없다 — 다음 청구 시작일을 사람이 정한다 */
  | "NO_ANCHOR"
  /** 납부 기한이 지난 청구서가 있다 — 독촉이 먼저 */
  | "OVERDUE"
  /** 퇴원 예정일이 이 이용 기간이 끝나기 전이다 */
  | "WITHDRAWING"
  /** 이어서 낼 청구의 시작일이 지난 지 오래됐다 (그만둔 학생일 수 있어 사람이 판단) */
  | "STALE";

export const SCHEDULE_BLOCKER_LABEL: Record<ScheduleBlocker, string> = {
  HOLD: "보류",
  NO_ANCHOR: "청구 시작일 필요",
  OVERDUE: "미납",
  WITHDRAWING: "퇴원 예정",
  STALE: "이용 기간 지남",
};

export type ScheduleEntry = {
  /** NEW = 처음 내는 청구서, RENEWAL = 이어서 내는 청구서 */
  kind: "NEW" | "RENEWAL";
  periodStart: Date;
  periodEnd: Date;
  /** 청구서가 걸친 달 수 (일할 달 포함) */
  months: number;
  /** 첫 달이 일할이면 청구 일수·일 단가·그달 남은 날 */
  prorated: { days: number; dailyRate: number; calendarDays: number } | null;
  /** 이 청구에 쓰는 월 수강료 (세 달 선등록이면 할인 금액) */
  monthlyFee: number;
  /** 세 달 선등록 청구인지 */
  prepay: boolean;
  /** 반 이름 (정규반·선택반) */
  planName: string;
  /** 청구 금액. 계산할 수 없으면 null */
  amount: number | null;
  /** 자동 발행일 — 이용 시작 N일 전 (이미 지났을 수 있다) */
  issueOn: Date;
  blockers: ScheduleBlocker[];
};

export type StudentScheduleInput = {
  /** 등록일 (KST 날짜) */
  enrolledOn: Date;
  /** 퇴원 예정일 (KST 날짜) */
  withdrawOn: Date | null;
  /** 반 요금제 */
  plan: TuitionPlan;
  /** 학생별 월 수강료 (형제 할인 등). 있으면 반 금액 대신 쓰고, 세 달 선등록에도 같은 금액 */
  customMonthlyFee: number | null;
  /** 다음 청구 시작일 — 시스템 전부터 다닌 학생이나 휴원 뒤 복귀처럼 사람이 정해 둔 날 */
  anchor: Date | null;
  /** 이미 낸 청구서(미납 포함)가 덮는 마지막 이용일. 처음이면 null */
  billedUntil: Date | null;
  /** 마지막으로 납부한 청구서의 개월 수 — 세 달 선등록이었으면 이어서도 세 달 */
  lastMonths: number | null;
  /** 납부 기한이 지난 청구서 수 */
  overdueCount: number;
  /** 보류 사유 — 있으면 자동으로 내지 않는다 */
  holdReason: string | null;
};

/** 학생의 다음 청구 — 15일 전 입실이면 [그달 일할, 다음 달] 두 건, 아니면 한 건 */
export function planStudentSchedule(
  input: StudentScheduleInput,
  options: { today: Date; autoIssueLeadDays: number; pricing: TuitionPricing },
): ScheduleEntry[] {
  const { today, pricing } = options;
  const { plan } = input;

  const make = (kind: ScheduleEntry["kind"], start: Date, months: number, extra: ScheduleBlocker[] = []): ScheduleEntry => {
    const midMonth = start.getUTCDate() !== 1;
    const prepay = !midMonth && months >= pricing.prepayMonths;
    const monthlyFee = input.customMonthlyFee ?? (prepay ? plan.prepayMonthlyFee : plan.monthlyFee);
    const prorated = midMonth ? proratedChargeOf({ from: start, monthlyFee, plan, pricing }) : null;
    const periodEnd = calendarPeriodEnd(start, months);
    const quote = calcInvoiceAmount({ monthlyFee, months, prorated: prorated ?? undefined });
    const blockers: ScheduleBlocker[] = [...(input.holdReason ? (["HOLD"] as const) : []), ...extra];
    if (input.overdueCount > 0) blockers.push("OVERDUE");
    if (input.withdrawOn && input.withdrawOn.getTime() < periodEnd.getTime()) blockers.push("WITHDRAWING");
    if (kind === "RENEWAL" && diffDays(start, today) > AUTO_ISSUE_GRACE_DAYS) blockers.push("STALE");
    return {
      kind,
      periodStart: start,
      periodEnd,
      months,
      prorated: prorated && { days: prorated.days, dailyRate: prorated.dailyRate, calendarDays: prorated.calendarDays },
      monthlyFee,
      prepay,
      planName: plan.name,
      amount: quote.ok ? quote.amount : null,
      issueOn: addDays(start, -options.autoIssueLeadDays),
      blockers,
    };
  };

  /** start 부터의 청구 — 1일이면 months 달, 달 중간이면 일할(15일 이후는 다음 달까지 한 청구서) */
  const from = (kind: ScheduleEntry["kind"], start: Date, months: number): ScheduleEntry[] => {
    if (start.getUTCDate() === 1) return [make(kind, start, months)];
    if (start.getUTCDate() >= pricing.combineFromDay) return [make(kind, start, 2)];
    return [make(kind, start, 1), make("RENEWAL", addDays(monthEndOf(start), 1), 1)];
  };

  if (input.billedUntil) {
    // 휴원 뒤 복귀 등으로 납부 기간보다 뒤에 시작일을 정해 두었으면 그 날부터, 아니면 이어서
    const start =
      input.anchor && input.anchor.getTime() > input.billedUntil.getTime() ? input.anchor : addDays(input.billedUntil, 1);
    return from("RENEWAL", start, input.lastMonths === pricing.prepayMonths ? pricing.prepayMonths : 1);
  }
  if (input.anchor) return from("NEW", input.anchor, 1);

  // 처음 청구 — 지난달 1일 이후 입실이면 신규 규칙대로 입실일부터.
  // 그보다 오래 다녔는데 낸 기록이 없으면(시스템 전부터 다닌 학생) 이미 받은 회차가 있을 수 있어 사람이 시작일을 정한다.
  const lastMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  if (input.enrolledOn.getTime() >= lastMonthStart.getTime()) return from("NEW", input.enrolledOn, 1);
  return [make("NEW", addDays(monthEndOf(today), 1), 1, ["NO_ANCHOR"])];
}

/** 오늘 자동으로 낼 수 있는 청구인지 — 발행일이 됐고 막힌 이유가 없다 */
export function isAutoIssuable(entry: ScheduleEntry, today: Date): boolean {
  return entry.blockers.length === 0 && entry.amount !== null && entry.issueOn.getTime() <= today.getTime();
}
