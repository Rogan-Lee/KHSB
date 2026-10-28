// 수강료 한눈에 보기 — 월별 청구·수납, 납부 시점, 미납 경과일, 발행 일정, 최근 활동을 모은다.
// 순수 함수 (조회는 admin-data). 금액이 들어가므로 원장급 화면에서만 쓴다.

import { addDays, addMonthsClamped, dateKey, diffDays, kstDateOf, parseDateKey } from "@/lib/tuition/calc";

/** 최근 몇 달을 추이로 보여 줄지 */
export const DASHBOARD_MONTHS = 6;

export type DashboardInvoiceInput = {
  dueDate: Date;
  amount: number;
  status: string;
  paidAt: Date | null;
  paidAmount: number;
  refundedAmount: number;
};

export type DashboardMonth = {
  /** "YYYY-MM" (납부 기한 기준) */
  ym: string;
  /** 청구 금액 (취소 제외) */
  billed: number;
  /** 순수납액 (납부 − 환불) */
  received: number;
  /** 아직 못 받은 금액 */
  unpaidAmount: number;
  /** 납부 기한까지 낸 건수 */
  onTime: number;
  /** 기한 뒤에 낸 건수 */
  late: number;
  /** 기한이 지났는데 아직 안 낸 건수 */
  unpaid: number;
};

const PAID = new Set(["PAID", "PARTIALLY_REFUNDED", "REFUNDED"]);

/** 월별 청구·수납과 납부 시점 — 조회한 달까지 DASHBOARD_MONTHS 달, 오래된 달부터 */
export function monthlyTrend(invoices: DashboardInvoiceInput[], monthStart: Date, today: Date): DashboardMonth[] {
  const months = Array.from({ length: DASHBOARD_MONTHS }, (_, i) =>
    dateKey(addMonthsClamped(monthStart, i - DASHBOARD_MONTHS + 1)).slice(0, 7),
  );
  const byYm = new Map<string, DashboardMonth>(
    months.map((ym) => [ym, { ym, billed: 0, received: 0, unpaidAmount: 0, onTime: 0, late: 0, unpaid: 0 }]),
  );
  for (const invoice of invoices) {
    if (invoice.status === "CANCELED") continue;
    const month = byYm.get(dateKey(invoice.dueDate).slice(0, 7));
    if (!month) continue;
    month.billed += invoice.amount;
    month.received += invoice.paidAmount - invoice.refundedAmount;
    if (invoice.status === "REQUESTED") {
      month.unpaidAmount += invoice.amount;
      if (invoice.dueDate.getTime() < today.getTime()) month.unpaid += 1;
    } else if (PAID.has(invoice.status) && invoice.paidAt) {
      // 납부 기한(날짜)이 지난 뒤 KST 날짜에 냈으면 늦게 낸 것
      if (kstDateOf(invoice.paidAt).getTime() > invoice.dueDate.getTime()) month.late += 1;
      else month.onTime += 1;
    }
  }
  return months.map((ym) => byYm.get(ym) as DashboardMonth);
}

export type AgingBucket = { key: string; label: string; count: number; amount: number };

const AGING = [
  { key: "D1_7", label: "1~7일", max: 7 },
  { key: "D8_14", label: "8~14일", max: 14 },
  { key: "D15_30", label: "15~30일", max: 30 },
  { key: "D31", label: "31일 이상", max: Number.POSITIVE_INFINITY },
] as const;

/** 미납 경과일 구간 — 납부 기한이 지난 결제 요청 청구서만 */
export function agingBuckets(open: { dueDate: string; amount: number }[], today: Date): AgingBucket[] {
  const buckets = AGING.map((bucket) => ({ key: bucket.key, label: bucket.label, count: 0, amount: 0 }));
  for (const invoice of open) {
    const due = parseDateKey(invoice.dueDate);
    if (!due) continue;
    const days = diffDays(due, today);
    if (days < 1) continue;
    const index = AGING.findIndex((bucket) => days <= bucket.max);
    buckets[index].count += 1;
    buckets[index].amount += invoice.amount;
  }
  return buckets;
}

export type ScheduleDay = { date: string; count: number; amount: number; attention: number };

/**
 * 발행 일정을 날짜별로 — 오늘까지 발행일이 된 것은 오늘 한 줄로 모은다. amount 는 막힌 청구를 뺀 금액.
 * days 일 뒤까지만.
 */
export function scheduleByDay(
  entries: { issueOn: string; amount: number | null; blocked: boolean }[],
  today: Date,
  days: number,
): ScheduleDay[] {
  const todayKey = dateKey(today);
  const lastKey = dateKey(addDays(today, days));
  const byDate = new Map<string, ScheduleDay>();
  for (const entry of entries) {
    const date = entry.issueOn < todayKey ? todayKey : entry.issueOn;
    if (date > lastKey) continue;
    const day = byDate.get(date) ?? { date, count: 0, amount: 0, attention: 0 };
    day.count += 1;
    if (entry.blocked) day.attention += 1;
    else day.amount += entry.amount ?? 0;
    byDate.set(date, day);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** 최근 활동에 보여 줄 돈 관련 기록과 그 이름 (결제 링크 생성·결제창 열림 같은 중간 단계는 뺀다) */
export const ACTIVITY_LABEL: Record<string, string> = {
  INVOICE_ISSUED: "청구서 발행",
  INVOICE_CANCELED: "청구 취소",
  PAYMENT_DONE: "납부",
  ONSITE_REQUESTED: "현장 결제 신청",
  REFUND_DONE: "환불 완료",
  REFUND_FAILED: "환불 실패",
  REFUND_EXTERNAL: "결제사에서 취소",
  NOTICE_SENT: "안내 발송",
  BILL_TALK_SENT: "알림톡 발송",
};
