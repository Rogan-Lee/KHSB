// 수강료 설정 조회 — 단일 행("default"). 행이 없으면 기본값.
import type { TuitionRefundPolicy, TuitionTaxType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import type { RefundFacility } from "@/lib/tuition/calc";
import { DEFAULT_TUITION_PRICING, readPricing, type TuitionPricing } from "@/lib/tuition/pricing";
import { getTuitionProvider } from "@/lib/tuition/provider-registry";

export type TuitionSettingValues = {
  defaultMonthlyFee: number | null;
  dueDays: number;
  leadDays: number;
  /** "7,3" — parseReminderDays 로 푼다 */
  reminderDays: string;
  refundPolicy: TuitionRefundPolicy;
  onlinePaymentEnabled: boolean;
  /** 과세 유형 — 청구서를 발행할 때 그 청구서에 스냅샷으로 남는다 */
  taxType: TuitionTaxType;
  /** 다음 이용 시작 autoIssueLeadDays 일 전에 1개월 청구서를 자동 발행 (청구 일정 — schedule.ts) */
  autoIssueEnabled: boolean;
  autoIssueLeadDays: number;
  guideText: string | null;
  onsiteGuideText: string | null;
  /** 반별 수강료·일할 산식 */
  pricing: TuitionPricing;
};

export const TUITION_SETTING_DEFAULTS: TuitionSettingValues = {
  defaultMonthlyFee: null,
  dueDays: 7,
  leadDays: 7,
  reminderDays: "7,3",
  // 강한선배 환불 규정(교습비 반환 기준 = 학원법 구간식). 설정을 저장한 적이 없을 때의 기본값
  refundPolicy: "ACADEMY_LAW",
  onlinePaymentEnabled: true,
  taxType: "EXEMPT",
  autoIssueEnabled: false,
  autoIssueLeadDays: 3,
  guideText: null,
  onsiteGuideText: null,
  pricing: DEFAULT_TUITION_PRICING,
};

export async function getTuitionSetting(): Promise<TuitionSettingValues> {
  const row = await prisma.tuitionSetting.findUnique({ where: { id: "default" } });
  if (!row) return TUITION_SETTING_DEFAULTS;
  return {
    defaultMonthlyFee: row.defaultMonthlyFee,
    dueDays: row.dueDays,
    leadDays: row.leadDays,
    reminderDays: row.reminderDays,
    refundPolicy: row.refundPolicy,
    onlinePaymentEnabled: row.onlinePaymentEnabled,
    taxType: row.taxType,
    autoIssueEnabled: row.autoIssueEnabled,
    autoIssueLeadDays: row.autoIssueLeadDays,
    guideText: row.guideText,
    onsiteGuideText: row.onsiteGuideText,
    pricing: readPricing(row.pricing),
  };
}

/** 온라인 결제를 받을 수 있는지 — 결제사 키(또는 개발용 모의 결제)가 있고 설정 스위치가 켜져 있을 때만 */
export async function isOnlinePaymentAvailable(): Promise<boolean> {
  if (!getTuitionProvider()) return false;
  return (await getTuitionSetting()).onlinePaymentEnabled;
}

/** 시설 종류 · 게시한 1일 교습비 — 스키마를 바꾸지 않고 AppSetting 에 둔다 (법정 반환액 계산용) */
export const REFUND_FACILITY_KEYS = {
  facilityKind: "tuition.facilityKind",
  postedDailyFee: "tuition.postedDailyFee",
} as const;

/** 저장한 적이 없으면 독서실 · 게시 1일 교습비 없음 (1호 고객이 교육청에 독서실로 등록돼 있다) */
export async function getRefundFacility(): Promise<RefundFacility> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [REFUND_FACILITY_KEYS.facilityKind, REFUND_FACILITY_KEYS.postedDailyFee] } },
    select: { key: true, value: true },
  });
  const value = (key: string) => rows.find((row) => row.key === key)?.value;
  const fee = Number(value(REFUND_FACILITY_KEYS.postedDailyFee));
  return {
    facilityKind: value(REFUND_FACILITY_KEYS.facilityKind) === "ACADEMY" ? "ACADEMY" : "STUDY_ROOM",
    postedDailyFee: Number.isInteger(fee) && fee > 0 ? fee : null,
  };
}
