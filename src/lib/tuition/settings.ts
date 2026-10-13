// 수강료 설정 조회 — 단일 행("default"). 행이 없으면 기본값.
import type { TuitionRefundPolicy, TuitionTaxType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
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
  /** 이용 종료 autoIssueLeadDays 일 전에 다음 1개월 청구서를 자동 발행 */
  autoIssueEnabled: boolean;
  autoIssueLeadDays: number;
  guideText: string | null;
  onsiteGuideText: string | null;
};

export const TUITION_SETTING_DEFAULTS: TuitionSettingValues = {
  defaultMonthlyFee: null,
  dueDays: 7,
  leadDays: 7,
  reminderDays: "7,3",
  refundPolicy: "DAILY",
  onlinePaymentEnabled: true,
  taxType: "EXEMPT",
  autoIssueEnabled: false,
  autoIssueLeadDays: 3,
  guideText: null,
  onsiteGuideText: null,
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
  };
}

/** 온라인 결제를 받을 수 있는지 — 결제사 키(또는 개발용 모의 결제)가 있고 설정 스위치가 켜져 있을 때만 */
export async function isOnlinePaymentAvailable(): Promise<boolean> {
  if (!getTuitionProvider()) return false;
  return (await getTuitionSetting()).onlinePaymentEnabled;
}
