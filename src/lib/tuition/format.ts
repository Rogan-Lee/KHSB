// 수강료 표시용 문구·서식 — 서버와 어드민 화면(클라이언트)이 같이 쓴다. DB·서버 전용 모듈을 import 하지 말 것.

import type { TuitionDisplayStatus } from "@/lib/tuition/calc";

export type TuitionTone = "gray" | "brand" | "ok" | "warn" | "bad" | "info" | "violet";

export const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export const INVOICE_STATUS_LABEL: Record<TuitionDisplayStatus, string> = {
  REQUESTED: "결제 요청",
  OVERDUE: "미납",
  PAID: "납부 완료",
  PARTIALLY_REFUNDED: "일부 환불",
  REFUNDED: "환불",
  CANCELED: "청구 취소",
};

export const INVOICE_STATUS_TONE: Record<TuitionDisplayStatus, TuitionTone> = {
  REQUESTED: "info",
  OVERDUE: "bad",
  PAID: "ok",
  PARTIALLY_REFUNDED: "warn",
  REFUNDED: "gray",
  CANCELED: "gray",
};

export const PAYMENT_METHOD_LABEL = {
  LINK: "온라인 결제",
  LOCAL_CURRENCY: "지역화폐",
  ONSITE_CARD: "현장 카드",
  CASH: "현금",
  TRANSFER: "계좌이체",
} as const;

export const PAYMENT_STATUS_LABEL = {
  PENDING: "결제 대기",
  ONSITE_REQUESTED: "현장 결제 신청",
  DONE: "결제 완료",
  CANCELED: "닫힘",
  FAILED: "링크 생성 실패",
} as const;

export const PAYMENT_CLOSED_REASON_LABEL: Record<string, string> = {
  EXPIRED: "링크 기한 만료",
  REPLACED: "새 결제 링크로 교체",
  INVOICE_PAID: "다른 방법으로 납부됨",
  INVOICE_CANCELED: "청구 취소",
  ONSITE_REQUESTED: "현장 결제 신청으로 전환",
  WITHDRAWN: "학부모가 신청 철회",
  DISMISSED: "운영진이 신청 반려",
};

export const REFUND_STATUS_LABEL = {
  PENDING: "환불 처리 중",
  DONE: "환불 완료",
  FAILED: "환불 실패",
} as const;

export const REFUND_SOURCE_LABEL = {
  STAFF: "운영진 환불",
  AUTO_DUPLICATE: "중복 결제 자동 환불",
  EXTERNAL: "결제사에서 직접 취소",
} as const;

export const REFUND_POLICY_LABEL = {
  DAILY: "일할 계산",
  ACADEMY_LAW: "학원법 구간식",
  MANUAL: "직접 입력",
} as const;

export const NOTICE_KIND_LABEL = {
  REQUEST: "청구 안내",
  REMIND: "미납 안내",
  RENEWAL: "재결제 안내",
  PAID: "납부 확인",
  REFUND: "환불 안내",
} as const;

export const TAX_TYPE_LABEL = {
  EXEMPT: "면세",
  TAXABLE: "과세",
} as const;

export const CASH_RECEIPT_STATUS_LABEL = {
  REQUESTED: "발급 필요",
  ISSUED: "발급 완료",
  CANCELED: "취소",
} as const;

export const CASH_RECEIPT_PURPOSE_LABEL = {
  INCOME: "소득공제",
  EXPENSE: "지출증빙",
} as const;

/** "2026-11-01" → "2026.11.01" */
export function dotDate(key: string): string {
  return key.replaceAll("-", ".");
}

/** "2026-11-01" → "11월 1일" */
export function monthDay(key: string): string {
  const [, m, d] = key.split("-");
  return `${Number(m)}월 ${Number(d)}일`;
}

export function periodLabel(startKey: string, endKey: string): string {
  return `${dotDate(startKey)} ~ ${dotDate(endKey)}`;
}

/** 청구서 제목 — "11월 수강료", 선결제면 "11월~1월 수강료 (3개월)" */
export function invoiceTitle(startKey: string, endKey: string, months: number, proratedDays?: number): string {
  const startMonth = Number(startKey.slice(5, 7));
  const endMonth = Number(endKey.slice(5, 7));
  if (proratedDays) {
    if (months <= 1) return `${startMonth}월 수강료 (일할 ${proratedDays}일)`;
    const nextMonth = (startMonth % 12) + 1;
    return `${startMonth}월 일할(${proratedDays}일) + ${nextMonth === endMonth ? `${endMonth}월` : `${nextMonth}월~${endMonth}월`} 수강료`;
  }
  if (months <= 1) return `${startMonth}월 수강료`;
  return `${startMonth}월~${endMonth}월 수강료 (${months}개월)`;
}

/** 결제 링크·영수증에 보이는 이름 — 링크를 가진 사람은 누구나 볼 수 있으니 가운데 글자를 가린다 */
export function maskName(name: string): string {
  const chars = [...name.trim()];
  if (chars.length <= 1) return name.trim();
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}${"*".repeat(chars.length - 2)}${chars[chars.length - 1]}`;
}

/** 현금영수증 발급 번호를 가려서 보여 준다 (010****1234 · 123**67890) */
export function maskCashReceiptIdentifier(identifier: string): string {
  if (identifier.length <= 4) return "*".repeat(identifier.length);
  if (identifier.length === 10) return `${identifier.slice(0, 3)}**${identifier.slice(5)}`;
  return `${identifier.slice(0, 3)}****${identifier.slice(-4)}`;
}

/** 할부 표시 — 0·1 = 일시불 */
export function installmentLabel(months: number | null): string | null {
  if (months === null) return null;
  return months <= 1 ? "일시불" : `${months}개월`;
}
