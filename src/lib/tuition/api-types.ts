// 학부모 앱 수강료 API 응답 형태 — 서버(src/lib/mobile-parent-tuition.ts)와
// 앱(apps/mobile/src/lib/api/parent-tuition.ts)이 같은 모양을 쓴다. 앱 쪽은 손으로 맞춰 둔 사본이다.
// 이미 배포된 앱이 있으므로 필드는 추가만 한다 (이름 변경·삭제 금지).
// 날짜는 "YYYY-MM-DD"(KST), 시각은 ISO 문자열.

import type { TuitionDisplayStatus, TuitionExtraItem } from "@/lib/tuition/calc";
import type { OnsiteRequestMethod, TuitionErrorCode } from "@/lib/tuition/types";

export type ParentTuitionInvoice = {
  id: string;
  /** "11월 수강료" */
  title: string;
  periodStart: string;
  periodEnd: string;
  months: number;
  amount: number;
  /** 금액 구성 — 수강료(월 수강료 × 개월) + 추가 항목 − 할인 = amount */
  breakdown: { monthlyFee: number; tuition: number; extraItems: TuitionExtraItem[]; discount: number };
  /** 과세일 때만 — 공급가액·세액 (면세면 null) */
  tax: { supplyAmount: number; taxAmount: number } | null;
  /** 운영진이 이 청구서에 적은 학부모 안내 메시지 */
  message: string | null;
  dueDate: string;
  /** 연체(OVERDUE)를 포함한 화면용 상태 */
  status: TuitionDisplayStatus;
  /** 납부 기한까지 남은 일수 (지났으면 음수) */
  daysToDue: number;
  paidAt: string | null;
  /** "온라인 결제(카드)" · "지역화폐" 등 */
  paidMethodLabel: string | null;
  receiptUrl: string | null;
  refundedAmount: number;
  /** 실제 이용 종료일 (환불 반영). 납부 전이거나 이용 기간이 없으면 null */
  coverageEnd: string | null;
  /** 확인 대기 중인 현장 결제 신청 */
  onsiteRequest: { paymentId: string; method: OnsiteRequestMethod; requestedAt: string } | null;
  /** 결제창을 열었지만 아직 완료가 확인되지 않은 온라인 결제 */
  linkPending: {
    startedAt: string | null;
    /** 가상계좌 입금 대기 안내 (가상계좌를 골랐을 때만) */
    deposit: { bank: string | null; accountNumber: string | null; dueAt: string | null } | null;
  } | null;
  refunds: { amount: number; status: "PENDING" | "DONE" | "FAILED"; completedAt: string | null }[];
};

export type ParentTuitionResponse = {
  studentName: string;
  /** false 면 결제하기 버튼을 숨기고 현장 결제만 안내한다 */
  onlinePaymentEnabled: boolean;
  guideText: string | null;
  onsiteGuideText: string | null;
  /** 결제가 필요한 청구서 (납부 기한이 빠른 순) */
  open: ParentTuitionInvoice[];
  /**
   * 다음 결제 안내.
   *  · DUE — 결제할 청구서가 있음 (date = 가장 빠른 납부 기한)
   *  · COVERAGE_END — 납부한 이용 기간이 끝나는 날 다음 날부터 다음 수강료 대상 (date = 다음 이용 시작일)
   *  · NONE — 안내할 내용 없음
   */
  nextPayment: { date: string | null; basis: "DUE" | "COVERAGE_END" | "NONE"; coverageEnd: string | null };
  /** 납부·환불·취소된 지난 청구서 (최근 순) */
  history: ParentTuitionInvoice[];
};

/**
 * 결제·신청 요청의 응답. 인증·형식 오류는 기존대로 HTTP 오류({ error })지만,
 * 앱이 분기해야 하는 업무 결과(이미 납부됨, 온라인 결제 미사용 등)는 HTTP 200 + ok:false 로 준다.
 * (앱의 MobileApiError 는 메시지만 남기고 상태 코드를 버리기 때문)
 */
export type ParentTuitionFailure = { ok: false; code: TuitionErrorCode; message: string };

export type ParentTuitionCheckoutResponse =
  | { ok: true; paymentId: string; payUrl: string; expiresAt: string }
  | ParentTuitionFailure;

export type ParentTuitionOnsiteResponse = { ok: true; paymentId: string } | ParentTuitionFailure;

export type ParentTuitionSyncResponse =
  | { ok: true; status: TuitionDisplayStatus; settled: boolean }
  | ParentTuitionFailure;

/** /parent/services 에 추가되는 전체 메뉴 요약 값 */
export type ParentTuitionSummary = "none" | "unpaid" | "overdue" | "onsite" | "paid";

/** /parent/overview children[] 에 추가되는 홈 배너용 값 (결제할 청구서가 없으면 null) */
export type ParentTuitionBanner = {
  invoiceId: string;
  title: string;
  amount: number;
  dueDate: string;
  overdue: boolean;
} | null;
