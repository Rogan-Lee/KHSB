// 수강료 어드민 화면(/tuition) 조회 — 읽기 전용. 쓰기는 전부 코어(@/lib/tuition/core)가 한다.
//
//  · 화면(클라이언트)으로 넘기는 값이라 전부 직렬화 가능한 형태로 만든다 — 날짜 "YYYY-MM-DD"(KST), 시각 ISO 문자열.
//    클라이언트 컴포넌트는 이 파일에서 타입만 가져다 쓴다 (import type). 값을 import 하면 Prisma 가 따라 들어간다.
//  · DB 요금제에 전송량 한도가 있다. 달·상태로 범위를 좁히고 필요한 열만 고른다 (지난 이력 전체 조회 금지).
//  · 금액 합계(kpi)·청구 예정·학생별 수강료는 원장급에게만 계산한다. 직원에게는 null·빈 배열을 내려
//    값 자체가 브라우저로 가지 않게 한다 (화면에서 숨기는 것만으로는 막히지 않는다).
//  · 결제사 키·응답 원문·학부모 계정 id 는 고르지 않는다.

import type { Prisma } from "@/generated/prisma/client";
import type {
  StudentStatus,
  TuitionCashReceiptPurpose,
  TuitionCashReceiptStatus,
  TuitionNoticeKind,
  TuitionPaymentMethod,
  TuitionPaymentStatus,
  TuitionRefundMethod,
  TuitionRefundSource,
  TuitionRefundStatus,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import {
  addDays,
  addMonthsClamped,
  dateKey,
  diffDays,
  invoiceDisplayStatus,
  isBillingDue,
  kstDateOf,
  nextPeriodStart,
  parseDateKey,
  periodEndFor,
  readExtraItems,
  refundableAmount,
  splitTax,
  type TuitionDisplayStatus,
  type TuitionExtraItem,
  type TuitionInvoiceStatusValue,
  type TuitionTaxTypeValue,
} from "@/lib/tuition/calc";
import {
  billUrl,
  buildNoticeShareText,
  getTuitionProviderInfo,
  getTuitionSetting,
  isOnlinePaymentAvailable,
  refundMethodFor,
  type TuitionProviderInfo,
  type TuitionSettingValues,
} from "@/lib/tuition/core";
import { maskCashReceiptIdentifier, PAYMENT_METHOD_LABEL } from "@/lib/tuition/format";
import { todayKST } from "@/lib/utils";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
/** 처리 중(PENDING) 환불이 이 시간을 넘기면 "처리 필요"로 올린다 — 정산 작업(15분 주기)이 두 번 돌고도 남는 시간 */
const REFUND_STUCK_MS = 30 * 60 * 1000;
// 청구서 한 건에 딸린 행은 원래 몇 개뿐이다. 상한은 비정상적으로 쌓인 경우의 안전장치.
const PAYMENTS_PER_INVOICE = 20;
const NOTICES_PER_INVOICE = 20;
const EVENTS_PER_INVOICE = 200;

// ─── 화면용 타입 ───────────────────────────────────────────────────────

export type TuitionAttentionCode =
  | "NEEDS_REVIEW" // 결제사에서 직접 취소되는 등 운영진 확인이 필요하다고 코어가 표시한 청구서
  | "REFUND_FAILED" // 환불 실패 (그 결제의 마지막 환불 시도가 실패로 끝남)
  | "REFUND_STUCK" // 환불이 30분 넘게 처리 중
  | "DUPLICATE_UNREFUNDED" // 중복·오결제인데 아직 다 돌려주지 못함
  | "LINK_FAILED" // 결제 링크 생성 실패가 마지막 시도
  | "CASH_RECEIPT_STALE"; // 현금영수증을 발급한 뒤 환불돼 발급 금액과 남은 수납액이 다름

export type TuitionAttention = { code: TuitionAttentionCode; label: string };

const ATTENTION_LABEL: Record<TuitionAttentionCode, string> = {
  NEEDS_REVIEW: "결제 내역 확인 필요",
  REFUND_FAILED: "환불 실패",
  REFUND_STUCK: "환불 처리 지연",
  DUPLICATE_UNREFUNDED: "중복 결제 미환불",
  LINK_FAILED: "결제 링크 생성 실패",
  CASH_RECEIPT_STALE: "현금영수증 재발급 필요",
};

export type AdminTuitionStudentRef = {
  id: string;
  name: string;
  grade: string;
  seat: string | null;
  status: StudentStatus;
};

/** 납부 전 청구서에 걸려 있는 결제 시도 요약 */
export type AdminOpenPayment = {
  /** 온라인 결제 링크 — 가장 최근 것 하나 */
  link: {
    paymentId: string;
    /** LINK_ISSUED 링크만 만들어짐 · CHECKOUT_STARTED 결제창을 열었으나 미완료 · DEPOSIT_WAITING 가상계좌 입금 대기 · LINK_FAILED 링크 생성 실패 */
    state: "LINK_ISSUED" | "CHECKOUT_STARTED" | "DEPOSIT_WAITING" | "LINK_FAILED";
    checkoutStartedAt: string | null;
    depositBank: string | null;
    depositDueAt: string | null;
    failMessage: string | null;
  } | null;
  /** 직원 확인을 기다리는 현장 결제 신청 */
  onsite: { paymentId: string; method: TuitionPaymentMethod; requestedAt: string | null } | null;
};

export type AdminInvoiceRow = {
  id: string;
  student: AdminTuitionStudentRef;
  title: string;
  periodStart: string;
  periodEnd: string;
  months: number;
  monthlyFee: number;
  /** 추가 청구 항목 (교재비 등) — amount = monthlyFee × months + 추가 항목 합 − discount */
  extraItems: TuitionExtraItem[];
  discount: number;
  amount: number;
  /** 자동 청구로 발행된 청구서 */
  autoIssued: boolean;
  dueDate: string;
  status: TuitionInvoiceStatusValue;
  /** 연체(OVERDUE)를 포함한 화면용 상태 */
  displayStatus: TuitionDisplayStatus;
  /** 납부 기한까지 남은 일수 (지났으면 음수) */
  daysToDue: number;
  paidAt: string | null;
  paidAmount: number;
  refundedAmount: number;
  coverageEnd: string | null;
  needsReview: boolean;
  /** 납부 기한이 조회한 달 안에 있는지 */
  inMonth: boolean;
  /** 이전 달부터 넘어온 미납 (납부 기한이 조회한 달보다 앞선 결제 요청) */
  carriedOver: boolean;
  /** "온라인 결제(카드)" · "지역화폐" 등. 납부 전이면 null */
  paidMethodLabel: string | null;
  /** 결제 요청 상태일 때만 채운다 */
  openPayment: AdminOpenPayment | null;
  /** 운영진이 처리해야 할 사유. 비어 있으면 처리할 것이 없다 */
  attention: TuitionAttention[];
  /** 가장 최근 청구·미납 안내 */
  lastNotice: { kind: TuitionNoticeKind; createdAt: string; sentCount: number } | null;
  /** 청구·미납 안내를 보낸 횟수 */
  noticeCount: number;
  /** 카카오톡 등으로 직접 전달할 안내문 (푸시와 같은 문구 + 청구서 링크). 결제 요청 상태일 때만 */
  noticeText: string | null;
  /** 앱 없이 여는 청구서 링크. 링크 기능 이전에 발행돼 토큰이 없는 청구서는 null (getTuitionBillLink 가 만들어 준다) */
  billUrl: string | null;
};

export type AdminOnsiteRequest = {
  paymentId: string;
  invoiceId: string;
  student: AdminTuitionStudentRef;
  title: string;
  periodStart: string;
  periodEnd: string;
  /** 받아야 할 금액 (청구 금액) */
  amount: number;
  dueDate: string;
  invoiceStatus: TuitionInvoiceStatusValue;
  method: TuitionPaymentMethod;
  requestedAt: string;
};

export type AdminRefundRow = {
  id: string;
  invoiceId: string;
  student: { id: string; name: string; grade: string };
  title: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  method: TuitionRefundMethod;
  source: TuitionRefundSource;
  status: TuitionRefundStatus;
  reason: string;
  failMessage: string | null;
  requestedByName: string | null;
  createdAt: string;
  completedAt: string | null;
  paymentMethodLabel: string;
  /** 처리 중이거나, 실패한 채로 다시 시도되지 않은 환불 */
  unresolved: boolean;
  /** 조회한 달에 요청된 환불인지 (false 면 아직 끝나지 않아 함께 보여 주는 이전 달 환불) */
  inMonth: boolean;
};

export type BillingTargetReason = "신규" | "이용 종료 임박" | "이용 기간 지남";

export type AdminBillingTarget = {
  student: AdminTuitionStudentRef;
  /** 납부한 이용 기간의 마지막 날. 납부한 적이 없으면 null */
  coverageEnd: string | null;
  /** 다음 청구서의 이용 시작일 */
  periodStart: string;
  /** 1개월 청구 시 이용 종료일 */
  suggestedPeriodEnd: string;
  /** 학생별 수강료 → 기본 수강료 순. 둘 다 없으면 null ("수강료 미설정") */
  monthlyFee: number | null;
  reason: BillingTargetReason;
};

export type AdminTuitionStudent = {
  id: string;
  name: string;
  grade: string;
  seat: string | null;
  /** 학생별 수강료 (없으면 기본 수강료를 쓴다) */
  monthlyFee: number | null;
  /** 학생별 → 기본 순으로 정해진 실제 적용 수강료 */
  effectiveMonthlyFee: number | null;
  billingPaused: boolean;
  memo: string | null;
  coverageEnd: string | null;
  /** 지금 발행한다면 이용 시작일 */
  nextPeriodStart: string;
  hasOpenInvoice: boolean;
};

export type TuitionKpi = {
  /** 조회한 달 청구 금액 (취소 제외) */
  billed: number;
  /** 조회한 달 청구서의 순수납액 (납부 − 환불) */
  received: number;
  /** 납부 기한과 상관없이 조회한 달에 실제 입금된 금액 */
  receivedThisMonth: number;
  /** 아직 받지 못한 금액 (이전 달에서 넘어온 미납 포함) */
  unpaidAmount: number;
  unpaidCount: number;
  overdueCount: number;
  /** 조회한 달 청구서의 환불 금액 */
  refunded: number;
  billingTargetCount: number;
};

/** 현금영수증 기록 — 발급은 홈택스 등에서 하고 여기에는 신청 정보·승인번호를 남긴다 */
export type AdminCashReceiptInfo = {
  id: string;
  status: TuitionCashReceiptStatus;
  purpose: TuitionCashReceiptPurpose;
  /** 원장급에게는 발급에 쓸 전체 번호, 직원에게는 가운데를 가린 번호 */
  identifier: string;
  /** 신청(발급) 금액 */
  amount: number;
  supplyAmount: number;
  taxAmount: number;
  approvalNumber: string | null;
  requestedByName: string | null;
  issuedAt: string | null;
  issuedByName: string | null;
  canceledAt: string | null;
  cancelReason: string | null;
  /** 발급한 뒤 환불돼 발급 금액과 남은 수납액이 다르다 — 취소하고 다시 발급해야 한다 */
  stale: boolean;
};

/** 현금·계좌이체 수납 한 건과 그 현금영수증 상태 */
export type AdminCashReceiptRow = {
  paymentId: string;
  invoiceId: string;
  student: { id: string; name: string; grade: string };
  title: string;
  method: TuitionPaymentMethod;
  paidAt: string;
  /** 지금 남아 있는 수납액 (환불 반영) — 현금영수증을 발급해야 할 금액 */
  amount: number;
  supplyAmount: number;
  taxAmount: number;
  /** 등록된 현금영수증이 없으면 null */
  receipt: AdminCashReceiptInfo | null;
  /** 운영진이 할 일이 남은 건 — 미등록·발급 필요·재발급 필요 */
  todo: boolean;
  /** 조회한 달에 수납한 건인지 (false 면 할 일이 남아 함께 보여 주는 이전 달 건) */
  inMonth: boolean;
};

export type TuitionAdminData = {
  ym: string;
  /** 오늘 (KST) — 화면의 D-day·기본 납부 기한 계산 기준 */
  today: string;
  /** 조회한 달 청구서 + 이전 달 미납 + (달과 상관없이) 처리가 필요한 청구서 */
  invoices: AdminInvoiceRow[];
  /** 납부 기한이 조회한 달 뒤인 결제 요청 — 목록에는 없지만 방문 결제는 바로 받을 수 있어야 한다 */
  upcomingInvoices: AdminInvoiceRow[];
  onsiteRequests: AdminOnsiteRequest[];
  refunds: AdminRefundRow[];
  /** 조회한 달의 현금·계좌이체 수납 + (달과 상관없이) 현금영수증 처리가 남은 수납 */
  cashReceipts: AdminCashReceiptRow[];
  /** 금액이 들어가지 않는 건수 — 직원 화면의 요약 카드용 */
  counts: {
    monthInvoices: number;
    requested: number;
    overdue: number;
    onsiteRequests: number;
    /** 현금영수증 처리가 남은 수납 건수 */
    cashReceiptTodo: number;
  };
  /** 원장급만. 직원이면 빈 배열 */
  billingTargets: AdminBillingTarget[];
  /** 원장급만. 직원이면 null */
  kpi: TuitionKpi | null;
  /** 원장급만. 직원이면 빈 배열 */
  students: AdminTuitionStudent[];
  setting: TuitionSettingValues;
  onlinePaymentAvailable: boolean;
  /** 연동된 결제사와 그 결제사가 할 수 있는 일. 연동이 없으면 null */
  provider: TuitionProviderInfo | null;
};

export type AdminPaymentDetail = {
  id: string;
  method: TuitionPaymentMethod;
  methodLabel: string;
  status: TuitionPaymentStatus;
  closedReason: string | null;
  amount: number;
  paidAmount: number;
  refundedAmount: number;
  /** 처리 중인 환불 합계 */
  pendingRefundAmount: number;
  /** 지금 환불할 수 있는 금액 (납부 − 환불 완료 − 처리 중) */
  refundable: number;
  /**
   * 결제사로는 전액 취소만 되는 결제 — 일부 금액을 환불하려면 직접 돌려준 뒤 기록해야 한다.
   * (전액이라도 이미 일부를 환불한 결제는 직접 환불이다)
   */
  fullCancelOnly: boolean;
  /** 남은 금액 전부를 지금 환불할 때의 방식 — PROVIDER 결제사 취소 · MANUAL 직접 환불 기록 */
  fullRefundMethod: "PROVIDER" | "MANUAL";
  isDuplicate: boolean;
  /** 이 청구서의 납부로 확정된 결제인지 */
  isAccepted: boolean;
  providerMethod: string | null;
  /** 승인 정보 — 온라인 결제는 결제사가 준 값, 현장 카드·지역화폐는 직원이 적은 단말기 승인번호 */
  cardIssuer: string | null;
  cardType: string | null;
  /** 할부 개월 (0 = 일시불). 카드 결제가 아니면 null */
  installmentMonths: number | null;
  approvalNumber: string | null;
  approvedAt: string | null;
  receiptUrl: string | null;
  expiresAt: string | null;
  checkoutStartedAt: string | null;
  deposit: { bank: string | null; account: string | null; dueAt: string | null } | null;
  failMessage: string | null;
  requestedAt: string | null;
  confirmedByName: string | null;
  confirmedAt: string | null;
  memo: string | null;
  /** 현금·계좌이체 수납의 현금영수증 기록 */
  cashReceipt: AdminCashReceiptInfo | null;
  /** 현금영수증을 등록할 수 있는 수납인지 (현금·계좌이체로 받았고 남은 금액이 있음) */
  cashReceiptAllowed: boolean;
  createdAt: string;
};

export type AdminRefundDetail = {
  id: string;
  paymentId: string;
  amount: number;
  reason: string;
  calcBasis: string | null;
  effectiveDate: string | null;
  method: TuitionRefundMethod;
  source: TuitionRefundSource;
  status: TuitionRefundStatus;
  failMessage: string | null;
  requestedByName: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type AdminInvoiceDetail = {
  /** 오늘 (KST) — 환불 다이얼로그의 기본 마지막 이용일 계산 기준 */
  today: string;
  invoice: {
    id: string;
    title: string;
    periodStart: string;
    periodEnd: string;
    months: number;
    monthlyFee: number;
    /** 수강료 소계 (월 수강료 × 개월 수) */
    tuitionAmount: number;
    extraItems: TuitionExtraItem[];
    discount: number;
    amount: number;
    taxType: TuitionTaxTypeValue;
    /** 과세일 때만 — 청구 금액의 공급가액·세액 */
    tax: { supplyAmount: number; taxAmount: number } | null;
    dueDate: string;
    status: TuitionInvoiceStatusValue;
    displayStatus: TuitionDisplayStatus;
    daysToDue: number;
    paidAt: string | null;
    paidAmount: number;
    refundedAmount: number;
    coverageEnd: string | null;
    needsReview: boolean;
    memo: string | null;
    /** 학부모에게 보이는 안내 메시지 */
    parentMessage: string | null;
    autoIssued: boolean;
    billUrl: string | null;
    issuedByName: string | null;
    createdAt: string;
    canceledAt: string | null;
    canceledByName: string | null;
    cancelReason: string | null;
    attention: TuitionAttention[];
    noticeText: string | null;
  };
  student: AdminTuitionStudentRef;
  /** 최근 시도부터 */
  payments: AdminPaymentDetail[];
  /** 최근 요청부터 */
  refunds: AdminRefundDetail[];
  /** 최근 발송부터 */
  notices: { id: string; kind: TuitionNoticeKind; sentCount: number; sentByName: string | null; createdAt: string }[];
  /** 진행 기록 — 오래된 것부터 */
  events: { id: string; type: string; source: string; actorName: string | null; detail: string | null; createdAt: string }[];
};

// ─── 조회 열 ───────────────────────────────────────────────────────────

const STUDENT_REF_SELECT = {
  id: true,
  name: true,
  grade: true,
  seat: true,
  status: true,
} satisfies Prisma.StudentSelect;

const CASH_RECEIPT_SELECT = {
  id: true,
  status: true,
  purpose: true,
  identifier: true,
  amount: true,
  supplyAmount: true,
  taxAmount: true,
  approvalNumber: true,
  requestedByName: true,
  issuedAt: true,
  issuedByName: true,
  canceledAt: true,
  cancelReason: true,
} satisfies Prisma.TuitionCashReceiptSelect;

type CashReceiptRecord = Prisma.TuitionCashReceiptGetPayload<{ select: typeof CASH_RECEIPT_SELECT }>;

const INVOICE_ROW_SELECT = {
  id: true,
  title: true,
  periodStart: true,
  periodEnd: true,
  months: true,
  monthlyFee: true,
  discount: true,
  extraItems: true,
  amount: true,
  shareToken: true,
  autoIssued: true,
  dueDate: true,
  status: true,
  paidAt: true,
  paidAmount: true,
  paidPaymentId: true,
  refundedAmount: true,
  coverageEnd: true,
  needsReview: true,
  student: { select: STUDENT_REF_SELECT },
  payments: {
    orderBy: { createdAt: "desc" },
    take: PAYMENTS_PER_INVOICE,
    select: {
      id: true,
      method: true,
      status: true,
      paidAmount: true,
      refundedAmount: true,
      isDuplicate: true,
      providerMethod: true,
      checkoutStartedAt: true,
      depositBank: true,
      depositAccount: true,
      depositDueAt: true,
      failMessage: true,
      requestedAt: true,
      createdAt: true,
      cashReceipt: { select: { status: true, amount: true } },
    },
  },
  refunds: {
    orderBy: { createdAt: "asc" },
    select: { id: true, paymentId: true, amount: true, status: true, createdAt: true },
  },
  notices: {
    where: { kind: { in: ["REQUEST", "REMIND"] } },
    orderBy: { createdAt: "desc" },
    take: NOTICES_PER_INVOICE,
    select: { kind: true, sentCount: true, createdAt: true },
  },
} satisfies Prisma.TuitionInvoiceSelect;

type InvoiceRowRecord = Prisma.TuitionInvoiceGetPayload<{ select: typeof INVOICE_ROW_SELECT }>;

const INVOICE_DETAIL_SELECT = {
  id: true,
  title: true,
  periodStart: true,
  periodEnd: true,
  months: true,
  monthlyFee: true,
  discount: true,
  extraItems: true,
  amount: true,
  taxType: true,
  parentMessage: true,
  shareToken: true,
  autoIssued: true,
  dueDate: true,
  status: true,
  memo: true,
  paidAt: true,
  paidAmount: true,
  paidPaymentId: true,
  refundedAmount: true,
  coverageEnd: true,
  needsReview: true,
  issuedByName: true,
  canceledAt: true,
  canceledByName: true,
  cancelReason: true,
  createdAt: true,
  student: { select: STUDENT_REF_SELECT },
  payments: {
    orderBy: { createdAt: "desc" },
    take: PAYMENTS_PER_INVOICE,
    select: {
      id: true,
      method: true,
      status: true,
      amount: true,
      paidAmount: true,
      refundedAmount: true,
      isDuplicate: true,
      closedReason: true,
      expiresAt: true,
      checkoutStartedAt: true,
      providerMethod: true,
      cardIssuer: true,
      cardType: true,
      installmentMonths: true,
      approvalNumber: true,
      approvedAt: true,
      receiptUrl: true,
      depositBank: true,
      depositAccount: true,
      depositDueAt: true,
      failMessage: true,
      requestedAt: true,
      confirmedByName: true,
      confirmedAt: true,
      memo: true,
      createdAt: true,
      cashReceipt: { select: CASH_RECEIPT_SELECT },
    },
  },
  refunds: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      paymentId: true,
      amount: true,
      reason: true,
      calcBasis: true,
      effectiveDate: true,
      method: true,
      source: true,
      status: true,
      failMessage: true,
      requestedByName: true,
      completedAt: true,
      createdAt: true,
    },
  },
  notices: {
    orderBy: { createdAt: "desc" },
    take: NOTICES_PER_INVOICE,
    select: { id: true, kind: true, sentCount: true, sentByName: true, createdAt: true },
  },
} satisfies Prisma.TuitionInvoiceSelect;

// ─── 공용 계산 ─────────────────────────────────────────────────────────

/** KST 달력 날짜(UTC 자정 Date)의 실제 시작 시각 — 시각(timestamp) 열을 KST 날짜로 자를 때 쓴다 (kstDateOf 의 역) */
function kstStartOfDay(day: Date): Date {
  return new Date(day.getTime() - KST_OFFSET_MS);
}

function iso(at: Date | null | undefined): string | null {
  return at ? at.toISOString() : null;
}

function keyOrNull(day: Date | null | undefined): string | null {
  return day ? dateKey(day) : null;
}

/** "온라인 결제(카드)" · "지역화폐" — 학부모 앱(api-types 의 paidMethodLabel)과 같은 표기 */
function paymentMethodLabel(method: TuitionPaymentMethod, providerMethod: string | null): string {
  const base = PAYMENT_METHOD_LABEL[method];
  return method === "LINK" && providerMethod ? `${base}(${providerMethod})` : base;
}

/** 영수증 주소는 결제사가 준 값이다. 링크로 그리기 전에 https 주소만 통과시킨다 */
function safeHttpsUrl(url: string | null): string | null {
  return url && /^https:\/\//i.test(url) ? url : null;
}

/** 현금영수증 대상 수단 — 카드·지역화폐 결제는 카드 매출전표가 영수증이다 */
function isCashMethod(method: TuitionPaymentMethod): boolean {
  return method === "CASH" || method === "TRANSFER";
}

/** 발급한 현금영수증 금액이 환불 뒤 남은 수납액과 다른지 */
function isCashReceiptStale(
  receipt: { status: TuitionCashReceiptStatus; amount: number } | null | undefined,
  payment: { paidAmount: number; refundedAmount: number },
): boolean {
  return receipt?.status === "ISSUED" && receipt.amount !== payment.paidAmount - payment.refundedAmount;
}

function toCashReceiptInfo(
  receipt: CashReceiptRecord,
  payment: { paidAmount: number; refundedAmount: number },
  fullAccess: boolean,
): AdminCashReceiptInfo {
  return {
    id: receipt.id,
    status: receipt.status,
    purpose: receipt.purpose,
    // 발급에 쓰는 번호(휴대폰·사업자번호)는 발급하는 원장급에게만 전체를 내려 준다
    identifier: fullAccess ? receipt.identifier : maskCashReceiptIdentifier(receipt.identifier),
    amount: receipt.amount,
    supplyAmount: receipt.supplyAmount,
    taxAmount: receipt.taxAmount,
    approvalNumber: receipt.approvalNumber,
    requestedByName: receipt.requestedByName,
    issuedAt: iso(receipt.issuedAt),
    issuedByName: receipt.issuedByName,
    canceledAt: iso(receipt.canceledAt),
    cancelReason: receipt.cancelReason,
    stale: isCashReceiptStale(receipt, payment),
  };
}

type AttentionPayment = {
  id: string;
  method: TuitionPaymentMethod;
  status: TuitionPaymentStatus;
  paidAmount: number;
  refundedAmount: number;
  isDuplicate: boolean;
  cashReceipt?: { status: TuitionCashReceiptStatus; amount: number } | null;
};
type AttentionRefund = { paymentId: string; status: TuitionRefundStatus; createdAt: Date };

/**
 * 운영진이 처리해야 할 사유.
 * payments 는 최근 시도부터, refunds 는 오래된 요청부터 정렬돼 있어야 한다 (그 청구서의 환불 전부).
 */
export function tuitionAttentionOf(
  input: { needsReview: boolean; payments: AttentionPayment[]; refunds: AttentionRefund[] },
  now: Date,
): TuitionAttention[] {
  const codes: TuitionAttentionCode[] = [];
  if (input.needsReview) codes.push("NEEDS_REVIEW");

  // 실패한 환불은 "그 결제의 마지막 시도"일 때만 문제다 — 다시 시도해 끝났으면 해결된 것
  const latestByPayment = new Map<string, AttentionRefund>();
  for (const refund of input.refunds) latestByPayment.set(refund.paymentId, refund);
  if ([...latestByPayment.values()].some((r) => r.status === "FAILED")) codes.push("REFUND_FAILED");
  if (input.refunds.some((r) => r.status === "PENDING" && now.getTime() - r.createdAt.getTime() > REFUND_STUCK_MS)) {
    codes.push("REFUND_STUCK");
  }

  if (input.payments.some((p) => p.isDuplicate && p.paidAmount > p.refundedAmount)) {
    codes.push("DUPLICATE_UNREFUNDED");
  }

  const latest = input.payments[0];
  if (latest && latest.method === "LINK" && latest.status === "FAILED") codes.push("LINK_FAILED");

  if (input.payments.some((p) => isCashReceiptStale(p.cashReceipt, p))) codes.push("CASH_RECEIPT_STALE");

  return codes.map((code) => ({ code, label: ATTENTION_LABEL[code] }));
}

function billUrlOf(invoice: { shareToken: string | null }): string | null {
  return invoice.shareToken ? billUrl(invoice.shareToken) : null;
}

function noticeTextFor(
  invoice: { status: TuitionInvoiceStatusValue; title: string; amount: number; dueDate: Date; shareToken: string | null },
  studentName: string,
  today: Date,
): string | null {
  if (invoice.status !== "REQUESTED") return null;
  const overdue = invoice.dueDate.getTime() < today.getTime();
  return buildNoticeShareText(
    {
      // 기한 전이면 청구 안내, 지났으면 미납 안내 — 화면에서 보내는 푸시와 같은 기준
      kind: overdue ? "REMIND" : "REQUEST",
      studentName,
      title: invoice.title,
      amount: invoice.amount,
      dueDate: dateKey(invoice.dueDate),
      overdue,
      coverageEnd: null,
    },
    billUrlOf(invoice),
  );
}

function openPaymentOf(record: InvoiceRowRecord): AdminOpenPayment | null {
  if (record.status !== "REQUESTED") return null;

  const onsite = record.payments.find((p) => p.status === "ONSITE_REQUESTED");
  const pendingLink = record.payments.find((p) => p.method === "LINK" && p.status === "PENDING");
  const latest = record.payments[0];
  const failedLink = latest && latest.method === "LINK" && latest.status === "FAILED" ? latest : null;
  const linkPayment = pendingLink ?? failedLink;

  let link: AdminOpenPayment["link"] = null;
  if (linkPayment) {
    const depositWaiting =
      linkPayment.depositAccount !== null || linkPayment.depositBank !== null || linkPayment.depositDueAt !== null;
    link = {
      paymentId: linkPayment.id,
      state:
        linkPayment.status === "FAILED"
          ? "LINK_FAILED"
          : depositWaiting
            ? "DEPOSIT_WAITING"
            : linkPayment.checkoutStartedAt
              ? "CHECKOUT_STARTED"
              : "LINK_ISSUED",
      checkoutStartedAt: iso(linkPayment.checkoutStartedAt),
      depositBank: linkPayment.depositBank,
      depositDueAt: iso(linkPayment.depositDueAt),
      failMessage: linkPayment.status === "FAILED" ? linkPayment.failMessage : null,
    };
  }

  if (!link && !onsite) return null;
  return {
    link,
    onsite: onsite
      ? { paymentId: onsite.id, method: onsite.method, requestedAt: iso(onsite.requestedAt ?? onsite.createdAt) }
      : null,
  };
}

function toInvoiceRow(
  record: InvoiceRowRecord,
  ctx: { today: Date; now: Date; monthStart: Date; monthEnd: Date },
): AdminInvoiceRow {
  const accepted = record.paidPaymentId ? record.payments.find((p) => p.id === record.paidPaymentId) : undefined;
  const lastNotice = record.notices[0];
  const dueTime = record.dueDate.getTime();
  return {
    id: record.id,
    student: record.student,
    title: record.title,
    periodStart: dateKey(record.periodStart),
    periodEnd: dateKey(record.periodEnd),
    months: record.months,
    monthlyFee: record.monthlyFee,
    extraItems: readExtraItems(record.extraItems),
    discount: record.discount,
    amount: record.amount,
    autoIssued: record.autoIssued,
    dueDate: dateKey(record.dueDate),
    status: record.status,
    displayStatus: invoiceDisplayStatus(record, ctx.today),
    daysToDue: diffDays(ctx.today, record.dueDate),
    paidAt: iso(record.paidAt),
    paidAmount: record.paidAmount,
    refundedAmount: record.refundedAmount,
    coverageEnd: keyOrNull(record.coverageEnd),
    needsReview: record.needsReview,
    inMonth: dueTime >= ctx.monthStart.getTime() && dueTime <= ctx.monthEnd.getTime(),
    carriedOver: record.status === "REQUESTED" && dueTime < ctx.monthStart.getTime(),
    paidMethodLabel: accepted ? paymentMethodLabel(accepted.method, accepted.providerMethod) : null,
    openPayment: openPaymentOf(record),
    attention: tuitionAttentionOf(record, ctx.now),
    lastNotice: lastNotice
      ? { kind: lastNotice.kind, createdAt: lastNotice.createdAt.toISOString(), sentCount: lastNotice.sentCount }
      : null,
    noticeCount: record.notices.length,
    noticeText: noticeTextFor(record, record.student.name, ctx.today),
    billUrl: billUrlOf(record),
  };
}

// ─── 목록 화면 ─────────────────────────────────────────────────────────

export async function getTuitionAdminData(input: {
  /** "YYYY-MM" — 형식이 틀리면 이번 달 */
  ym: string;
  fullAccess: boolean;
  /** 오늘 (KST 달력 날짜, UTC 자정). 기본 todayKST() */
  today?: Date;
  /** 현재 시각 — 환불 처리 지연 판단용. 기본 new Date() */
  now?: Date;
}): Promise<TuitionAdminData> {
  const today = input.today ?? todayKST();
  const now = input.now ?? new Date();
  const monthStart =
    parseDateKey(`${input.ym}-01`) ?? (parseDateKey(`${dateKey(today).slice(0, 7)}-01`) as Date);
  const nextMonthStart = addMonthsClamped(monthStart, 1);
  const monthEnd = addDays(nextMonthStart, -1);
  // 시각 열(createdAt · paidAt)을 KST 달로 자르는 경계
  const monthStartAt = kstStartOfDay(monthStart);
  const nextMonthStartAt = kstStartOfDay(nextMonthStart);

  const [setting, onlinePaymentAvailable, records, onsiteRecords, refundRecords, cashRecords] = await Promise.all([
    getTuitionSetting(),
    isOnlinePaymentAvailable(),
    prisma.tuitionInvoice.findMany({
      where: {
        OR: [
          // 조회한 달 청구서 (상태 무관)
          { dueDate: { gte: monthStart, lte: monthEnd } },
          // 아직 받지 못한 청구서 전부 — 이전 달 미납은 목록에, 다음 달 기한은 방문 결제 선택지에 쓴다
          { status: "REQUESTED" },
          // 달과 상관없이 처리가 필요할 수 있는 청구서 — 실제 사유는 아래에서 다시 가린다.
          // (실패 환불·중복 결제는 드물어 상태 조건만으로도 범위가 작다)
          { needsReview: true },
          { refunds: { some: { status: { in: ["PENDING", "FAILED"] } } } },
          { payments: { some: { isDuplicate: true, paidAmount: { gt: 0 } } } },
          // 현금영수증을 발급한 뒤 환불된 청구서 (재발급 필요 여부는 아래에서 금액을 비교해 가린다)
          { refundedAmount: { gt: 0 }, cashReceipts: { some: { status: "ISSUED" } } },
        ],
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      select: INVOICE_ROW_SELECT,
    }),
    prisma.tuitionPayment.findMany({
      where: { status: "ONSITE_REQUESTED" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        method: true,
        requestedAt: true,
        createdAt: true,
        invoice: {
          select: {
            id: true,
            title: true,
            periodStart: true,
            periodEnd: true,
            amount: true,
            dueDate: true,
            status: true,
            student: { select: STUDENT_REF_SELECT },
          },
        },
      },
    }),
    prisma.tuitionRefund.findMany({
      where: {
        OR: [
          { createdAt: { gte: monthStartAt, lt: nextMonthStartAt } },
          { status: { in: ["PENDING", "FAILED"] } },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        invoiceId: true,
        amount: true,
        reason: true,
        method: true,
        source: true,
        status: true,
        failMessage: true,
        requestedByName: true,
        completedAt: true,
        createdAt: true,
        invoice: {
          select: {
            title: true,
            periodStart: true,
            periodEnd: true,
            student: { select: { id: true, name: true, grade: true } },
          },
        },
        payment: {
          select: {
            method: true,
            providerMethod: true,
            // 그 결제의 마지막 환불 — 실패가 그 뒤 재시도로 해결됐는지 본다
            refunds: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } },
          },
        },
      },
    }),
    // 현금·계좌이체 수납 — 조회한 달 수납분 + 달과 상관없이 현금영수증 처리가 남았을 수 있는 건
    prisma.tuitionPayment.findMany({
      where: {
        status: "DONE",
        isDuplicate: false,
        method: { in: ["CASH", "TRANSFER"] },
        OR: [
          { approvedAt: { gte: monthStartAt, lt: nextMonthStartAt } },
          { cashReceipt: { is: { status: "REQUESTED" } } },
          { refundedAmount: { gt: 0 }, cashReceipt: { is: { status: "ISSUED" } } },
        ],
      },
      orderBy: { approvedAt: "desc" },
      select: {
        id: true,
        method: true,
        paidAmount: true,
        refundedAmount: true,
        approvedAt: true,
        createdAt: true,
        cashReceipt: { select: CASH_RECEIPT_SELECT },
        invoice: {
          select: {
            id: true,
            title: true,
            taxType: true,
            student: { select: { id: true, name: true, grade: true } },
          },
        },
      },
    }),
  ]);

  const ctx = { today, now, monthStart, monthEnd };
  const rows = records.map((record) => toInvoiceRow(record, ctx));
  const invoices = rows.filter((row) => row.inMonth || row.carriedOver || row.attention.length > 0);
  const upcomingInvoices = rows.filter((row) => row.status === "REQUESTED" && !row.inMonth && !row.carriedOver);

  const monthRows = rows.filter((row) => row.inMonth);
  // 조회한 달까지 기한이 온 미납 (이번 달 + 이전 달에서 넘어온 것)
  const unpaidRows = rows.filter((row) => row.status === "REQUESTED" && (row.inMonth || row.carriedOver));
  const overdueCount = unpaidRows.filter((row) => row.displayStatus === "OVERDUE").length;

  const onsiteRequests: AdminOnsiteRequest[] = onsiteRecords.map((payment) => ({
    paymentId: payment.id,
    invoiceId: payment.invoice.id,
    student: payment.invoice.student,
    title: payment.invoice.title,
    periodStart: dateKey(payment.invoice.periodStart),
    periodEnd: dateKey(payment.invoice.periodEnd),
    amount: payment.invoice.amount,
    dueDate: dateKey(payment.invoice.dueDate),
    invoiceStatus: payment.invoice.status,
    method: payment.method,
    requestedAt: (payment.requestedAt ?? payment.createdAt).toISOString(),
  }));

  const refunds: AdminRefundRow[] = [];
  for (const refund of refundRecords) {
    const createdTime = refund.createdAt.getTime();
    const inMonth = createdTime >= monthStartAt.getTime() && createdTime < nextMonthStartAt.getTime();
    const unresolved =
      refund.status === "PENDING" ||
      (refund.status === "FAILED" && refund.payment.refunds[0]?.id === refund.id);
    // 이전 달의 실패 환불 중 이미 다시 처리된 것은 지난 일이다
    if (!inMonth && !unresolved) continue;
    refunds.push({
      id: refund.id,
      invoiceId: refund.invoiceId,
      student: refund.invoice.student,
      title: refund.invoice.title,
      periodStart: dateKey(refund.invoice.periodStart),
      periodEnd: dateKey(refund.invoice.periodEnd),
      amount: refund.amount,
      method: refund.method,
      source: refund.source,
      status: refund.status,
      reason: refund.reason,
      failMessage: refund.failMessage,
      requestedByName: refund.requestedByName,
      createdAt: refund.createdAt.toISOString(),
      completedAt: iso(refund.completedAt),
      paymentMethodLabel: paymentMethodLabel(refund.payment.method, refund.payment.providerMethod),
      unresolved,
      inMonth,
    });
  }

  const cashReceipts: AdminCashReceiptRow[] = [];
  for (const payment of cashRecords) {
    const paidAt = payment.approvedAt ?? payment.createdAt;
    const paidTime = paidAt.getTime();
    const inMonth = paidTime >= monthStartAt.getTime() && paidTime < nextMonthStartAt.getTime();
    const amount = payment.paidAmount - payment.refundedAmount;
    const receipt = payment.cashReceipt ? toCashReceiptInfo(payment.cashReceipt, payment, input.fullAccess) : null;
    // 할 일: 남은 수납액이 있는데 등록·발급이 안 됐거나, 발급한 금액이 환불로 달라진 건
    const todo = receipt
      ? receipt.status === "REQUESTED" || receipt.stale || (receipt.status === "CANCELED" && amount > 0)
      : amount > 0;
    // 전액 환불되고 영수증도 없는 수납은 볼 것이 없다. 이전 달 건은 할 일이 남았을 때만 보여 준다
    if (!receipt && amount <= 0) continue;
    if (!inMonth && !(receipt && (receipt.status === "REQUESTED" || receipt.stale))) continue;
    cashReceipts.push({
      paymentId: payment.id,
      invoiceId: payment.invoice.id,
      student: payment.invoice.student,
      title: payment.invoice.title,
      method: payment.method,
      paidAt: paidAt.toISOString(),
      amount,
      ...splitTax(amount, payment.invoice.taxType),
      receipt,
      todo,
      inMonth,
    });
  }

  const base = {
    ym: dateKey(monthStart).slice(0, 7),
    today: dateKey(today),
    invoices,
    upcomingInvoices,
    onsiteRequests,
    refunds,
    cashReceipts,
    counts: {
      monthInvoices: monthRows.length,
      requested: unpaidRows.length - overdueCount,
      overdue: overdueCount,
      onsiteRequests: onsiteRequests.length,
      cashReceiptTodo: cashReceipts.filter((row) => row.todo).length,
    },
    setting,
    onlinePaymentAvailable,
    provider: getTuitionProviderInfo(),
  };

  // 여기부터는 금액 합계와 학생별 수강료 — 원장급에게만 계산한다
  if (!input.fullAccess) return { ...base, billingTargets: [], kpi: null, students: [] };

  const [studentRecords, coverageRecords, receivedAggregate] = await Promise.all([
    prisma.student.findMany({
      // 재원 중인 학생 전부 (오프라인·온라인 관리 구분 없이)
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: {
        ...STUDENT_REF_SELECT,
        startDate: true,
        tuitionProfile: { select: { monthlyFee: true, billingPaused: true, memo: true } },
      },
    }),
    // 학생별 "납부한 이용 기간의 끝" — 학생당 한 줄만 받는다
    prisma.tuitionInvoice.groupBy({
      by: ["studentId"],
      where: {
        status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] },
        coverageEnd: { not: null },
        student: { status: "ACTIVE" },
      },
      _max: { coverageEnd: true },
    }),
    prisma.tuitionInvoice.aggregate({
      where: { paidAt: { gte: monthStartAt, lt: nextMonthStartAt } },
      _sum: { paidAmount: true },
    }),
  ]);

  const coverageByStudent = new Map<string, Date>();
  for (const row of coverageRecords) {
    if (row._max.coverageEnd) coverageByStudent.set(row.studentId, row._max.coverageEnd);
  }
  const openStudentIds = new Set(rows.filter((row) => row.status === "REQUESTED").map((row) => row.student.id));

  const students: AdminTuitionStudent[] = [];
  const billingTargets: AdminBillingTarget[] = [];
  for (const student of studentRecords) {
    const profile = student.tuitionProfile;
    const coverageEnd = coverageByStudent.get(student.id) ?? null;
    const hasOpenInvoice = openStudentIds.has(student.id);
    const nextStart = nextPeriodStart({ coverageEnd, enrolledOn: kstDateOf(student.startDate), today });
    const monthlyFee = profile?.monthlyFee ?? setting.defaultMonthlyFee ?? null;
    const billingPaused = profile?.billingPaused ?? false;

    students.push({
      id: student.id,
      name: student.name,
      grade: student.grade,
      seat: student.seat,
      monthlyFee: profile?.monthlyFee ?? null,
      effectiveMonthlyFee: monthlyFee,
      billingPaused,
      memo: profile?.memo ?? null,
      coverageEnd: keyOrNull(coverageEnd),
      nextPeriodStart: dateKey(nextStart),
      hasOpenInvoice,
    });

    if (billingPaused || hasOpenInvoice || !isBillingDue(nextStart, today, setting.leadDays)) continue;
    billingTargets.push({
      student: {
        id: student.id,
        name: student.name,
        grade: student.grade,
        seat: student.seat,
        status: student.status,
      },
      coverageEnd: keyOrNull(coverageEnd),
      periodStart: dateKey(nextStart),
      suggestedPeriodEnd: dateKey(periodEndFor(nextStart, 1)),
      monthlyFee,
      reason:
        coverageEnd === null ? "신규" : coverageEnd.getTime() < today.getTime() ? "이용 기간 지남" : "이용 종료 임박",
    });
  }
  // 이용 시작일이 빠른(더 급한) 학생부터
  billingTargets.sort(
    (a, b) => a.periodStart.localeCompare(b.periodStart) || a.student.name.localeCompare(b.student.name, "ko"),
  );

  const kpi: TuitionKpi = {
    billed: monthRows.reduce((sum, row) => (row.status === "CANCELED" ? sum : sum + row.amount), 0),
    received: monthRows.reduce((sum, row) => sum + row.paidAmount - row.refundedAmount, 0),
    receivedThisMonth: receivedAggregate._sum.paidAmount ?? 0,
    unpaidAmount: unpaidRows.reduce((sum, row) => sum + row.amount, 0),
    unpaidCount: unpaidRows.length,
    overdueCount,
    refunded: monthRows.reduce((sum, row) => sum + row.refundedAmount, 0),
    billingTargetCount: billingTargets.length,
  };

  return { ...base, billingTargets, kpi, students };
}

// ─── 청구서 상세 ───────────────────────────────────────────────────────

/** 청구서 상세 패널. 없는 청구서면 null */
export async function getTuitionInvoiceDetail(
  invoiceId: string,
  /** fullAccess 가 아니면 현금영수증 발급 번호를 가려서 내려 준다 */
  options: { today?: Date; now?: Date; fullAccess?: boolean } = {},
): Promise<AdminInvoiceDetail | null> {
  const today = options.today ?? todayKST();
  const now = options.now ?? new Date();
  const fullAccess = options.fullAccess === true;

  const [record, eventRecords] = await Promise.all([
    prisma.tuitionInvoice.findUnique({ where: { id: invoiceId }, select: INVOICE_DETAIL_SELECT }),
    prisma.tuitionEvent.findMany({
      where: { invoiceId },
      // 최근 것부터 상한까지 가져와 화면에는 시간순으로 뒤집어 보여 준다
      orderBy: { createdAt: "desc" },
      take: EVENTS_PER_INVOICE,
      select: { id: true, type: true, source: true, actorName: true, detail: true, createdAt: true },
    }),
  ]);
  if (!record) return null;

  const pendingByPayment = new Map<string, number>();
  for (const refund of record.refunds) {
    if (refund.status !== "PENDING") continue;
    pendingByPayment.set(refund.paymentId, (pendingByPayment.get(refund.paymentId) ?? 0) + refund.amount);
  }

  const provider = getTuitionProviderInfo();
  const payments: AdminPaymentDetail[] = record.payments.map((payment) => {
    const pendingRefundAmount = pendingByPayment.get(payment.id) ?? 0;
    const hasDeposit =
      payment.depositAccount !== null || payment.depositBank !== null || payment.depositDueAt !== null;
    return {
      id: payment.id,
      method: payment.method,
      methodLabel: paymentMethodLabel(payment.method, payment.providerMethod),
      status: payment.status,
      closedReason: payment.closedReason,
      amount: payment.amount,
      paidAmount: payment.paidAmount,
      refundedAmount: payment.refundedAmount,
      pendingRefundAmount,
      refundable: refundableAmount({
        paidAmount: payment.paidAmount,
        refundedAmount: payment.refundedAmount,
        pendingRefundAmount,
      }),
      fullCancelOnly: payment.method === "LINK" && provider !== null && !provider.partialCancel,
      fullRefundMethod: refundMethodFor(payment, payment.paidAmount - payment.refundedAmount),
      isDuplicate: payment.isDuplicate,
      isAccepted: record.paidPaymentId === payment.id,
      providerMethod: payment.providerMethod,
      cardIssuer: payment.cardIssuer,
      cardType: payment.cardType,
      installmentMonths: payment.installmentMonths,
      approvalNumber: payment.approvalNumber,
      approvedAt: iso(payment.approvedAt),
      receiptUrl: safeHttpsUrl(payment.receiptUrl),
      expiresAt: iso(payment.expiresAt),
      checkoutStartedAt: iso(payment.checkoutStartedAt),
      deposit: hasDeposit
        ? { bank: payment.depositBank, account: payment.depositAccount, dueAt: iso(payment.depositDueAt) }
        : null,
      failMessage: payment.failMessage,
      requestedAt: iso(payment.requestedAt),
      confirmedByName: payment.confirmedByName,
      confirmedAt: iso(payment.confirmedAt),
      memo: payment.memo,
      cashReceipt: payment.cashReceipt ? toCashReceiptInfo(payment.cashReceipt, payment, fullAccess) : null,
      cashReceiptAllowed:
        payment.status === "DONE" &&
        !payment.isDuplicate &&
        isCashMethod(payment.method) &&
        payment.paidAmount - payment.refundedAmount > 0,
      createdAt: payment.createdAt.toISOString(),
    };
  });

  return {
    today: dateKey(today),
    invoice: {
      id: record.id,
      title: record.title,
      periodStart: dateKey(record.periodStart),
      periodEnd: dateKey(record.periodEnd),
      months: record.months,
      monthlyFee: record.monthlyFee,
      tuitionAmount: record.monthlyFee * record.months,
      extraItems: readExtraItems(record.extraItems),
      discount: record.discount,
      amount: record.amount,
      taxType: record.taxType,
      tax: record.taxType === "TAXABLE" ? splitTax(record.amount, "TAXABLE") : null,
      dueDate: dateKey(record.dueDate),
      status: record.status,
      displayStatus: invoiceDisplayStatus(record, today),
      daysToDue: diffDays(today, record.dueDate),
      paidAt: iso(record.paidAt),
      paidAmount: record.paidAmount,
      refundedAmount: record.refundedAmount,
      coverageEnd: keyOrNull(record.coverageEnd),
      needsReview: record.needsReview,
      memo: record.memo,
      parentMessage: record.parentMessage,
      autoIssued: record.autoIssued,
      billUrl: billUrlOf(record),
      issuedByName: record.issuedByName,
      createdAt: record.createdAt.toISOString(),
      canceledAt: iso(record.canceledAt),
      canceledByName: record.canceledByName,
      cancelReason: record.cancelReason,
      attention: tuitionAttentionOf(record, now),
      noticeText: noticeTextFor(record, record.student.name, today),
    },
    student: record.student,
    payments,
    refunds: record.refunds
      .map((refund) => ({
        id: refund.id,
        paymentId: refund.paymentId,
        amount: refund.amount,
        reason: refund.reason,
        calcBasis: refund.calcBasis,
        effectiveDate: keyOrNull(refund.effectiveDate),
        method: refund.method,
        source: refund.source,
        status: refund.status,
        failMessage: refund.failMessage,
        requestedByName: refund.requestedByName,
        createdAt: refund.createdAt.toISOString(),
        completedAt: iso(refund.completedAt),
      }))
      .reverse(),
    notices: record.notices.map((notice) => ({
      id: notice.id,
      kind: notice.kind,
      sentCount: notice.sentCount,
      sentByName: notice.sentByName,
      createdAt: notice.createdAt.toISOString(),
    })),
    events: eventRecords
      .map((event) => ({
        id: event.id,
        type: event.type,
        source: event.source,
        actorName: event.actorName,
        detail: event.detail,
        createdAt: event.createdAt.toISOString(),
      }))
      .reverse(),
  };
}
