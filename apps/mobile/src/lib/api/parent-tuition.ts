import { mutateMobileApi, requestMobileApi } from '@/lib/mobile-api';

// 학부모 수강료 — 청구서 조회 · 온라인 결제(결제 링크) · 현장 결제 신청/철회 · 결제 확인.
// 서버: src/lib/mobile-parent-tuition.ts. 응답 형태의 원본은 src/lib/tuition/api-types.ts 이고,
// 앱은 루트 src 를 import 할 수 없어서 아래 타입은 손으로 맞춘 사본이다 (서버는 필드를 추가만 한다).
// 날짜는 "YYYY-MM-DD"(KST), 시각은 ISO 문자열. 모든 요청에 자녀 id 를 싣고 서버가 ParentLink 로 검증한다.

const BASE = '/api/mobile/v1/parent/tuition';

export const parentTuitionPath = (studentId: string) => `${BASE}?studentId=${encodeURIComponent(studentId)}`;

// ─── 응답 형태 (src/lib/tuition/api-types.ts 사본) ────────────────────

/** 화면용 청구서 상태 — 미납(OVERDUE)은 서버가 납부 기한으로 계산해 준다 */
export type TuitionDisplayStatus =
  | 'REQUESTED'
  | 'OVERDUE'
  | 'PAID'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'
  | 'CANCELED';

export type OnsiteRequestMethod = 'LOCAL_CURRENCY' | 'ONSITE_CARD';

export type TuitionErrorCode =
  | 'NOT_FOUND'
  | 'INVALID_INPUT'
  | 'PERIOD_OVERLAP'
  | 'INVOICE_NOT_PAYABLE'
  | 'ALREADY_PAID'
  | 'ONSITE_REQUEST_EXISTS'
  | 'ONLINE_DISABLED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_REJECTED'
  | 'NOT_REFUNDABLE'
  | 'REFUND_EXCEEDS'
  | 'REFUND_IN_PROGRESS'
  | 'REFUND_NEEDS_ACCOUNT'
  | 'BUSY'
  | 'INTERNAL';

export type ParentTuitionInvoice = {
  id: string;
  /** "11월 수강료" */
  title: string;
  periodStart: string;
  periodEnd: string;
  months: number;
  amount: number;
  /** 금액 구성 — 수강료(월 수강료 × 개월) + 추가 항목 − 할인 = amount. 예전 서버 응답에는 없다 */
  breakdown?: {
    monthlyFee: number;
    tuition: number;
    extraItems: { name: string; amount: number }[];
    discount: number;
  };
  /** 과세일 때만 — 공급가액·세액 (면세면 null) */
  tax?: { supplyAmount: number; taxAmount: number } | null;
  /** 운영진이 이 청구서에 적은 안내 메시지 */
  message?: string | null;
  dueDate: string;
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
  refunds: { amount: number; status: 'PENDING' | 'DONE' | 'FAILED'; completedAt: string | null }[];
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
  nextPayment: { date: string | null; basis: 'DUE' | 'COVERAGE_END' | 'NONE'; coverageEnd: string | null };
  /** 납부·환불·취소된 지난 청구서 (최근 순) */
  history: ParentTuitionInvoice[];
};

/**
 * 결제·신청 요청의 응답. 인증·형식 오류는 HTTP 오류({ error }) → MobileApiError 로 던져지고,
 * 앱이 갈라서 처리해야 하는 업무 결과(이미 납부됨, 온라인 결제 미사용 등)는 HTTP 200 + ok:false 로 온다.
 * (MobileApiError 는 메시지만 남기고 상태 코드를 버리기 때문에 code 로 분기한다)
 */
export type ParentTuitionFailure = { ok: false; code: TuitionErrorCode; message: string };

export type ParentTuitionCheckoutResponse =
  | { ok: true; paymentId: string; payUrl: string; expiresAt: string }
  | ParentTuitionFailure;

export type ParentTuitionOnsiteResponse = { ok: true; paymentId: string } | ParentTuitionFailure;

export type ParentTuitionWithdrawResponse = { ok: true } | ParentTuitionFailure;

export type ParentTuitionSyncResponse =
  | { ok: true; status: TuitionDisplayStatus; settled: boolean }
  | ParentTuitionFailure;

/** /parent/services 에 추가되는 전체 메뉴 요약 값 */
export type ParentTuitionSummary = 'none' | 'unpaid' | 'overdue' | 'onsite' | 'paid';

/** /parent/overview children[] 에 추가되는 홈 배너용 값 (결제할 청구서가 없으면 null) */
export type ParentTuitionBanner = {
  invoiceId: string;
  title: string;
  amount: number;
  dueDate: string;
  overdue: boolean;
} | null;

// ─── 요청 ────────────────────────────────────────────────────────────

/**
 * 본문이 비었거나 ok 가 없는 응답(프록시 오류 페이지 등)도 업무 실패 모양으로 맞춘다.
 * 호출하는 쪽이 res.ok 만 보면 되고, 빈 message 는 화면의 기본 문구로 바뀐다.
 */
function settle<T extends { ok: true }>(res: T | ParentTuitionFailure | null): T | ParentTuitionFailure {
  if (res && typeof res === 'object' && typeof res.ok === 'boolean') return res;
  return { ok: false, code: 'INTERNAL', message: '' };
}

/** 화면 조회와 같은 응답 — 결제 확인 중에 최신 상태를 직접 읽을 때 쓴다 */
export function fetchParentTuition(studentId: string) {
  return requestMobileApi<ParentTuitionResponse | null>(parentTuitionPath(studentId));
}

/** 결제 링크 발급 — 같은 청구서에 두 번 불러도 같은 링크가 온다 */
export async function startTuitionCheckout(studentId: string, invoiceId: string) {
  return settle(
    await mutateMobileApi<ParentTuitionCheckoutResponse | null>(`${BASE}/checkout`, 'POST', { studentId, invoiceId }),
  );
}

export async function requestTuitionOnsite(studentId: string, invoiceId: string, method: OnsiteRequestMethod) {
  return settle(
    await mutateMobileApi<ParentTuitionOnsiteResponse | null>(`${BASE}/onsite-request`, 'POST', {
      studentId,
      invoiceId,
      method,
    }),
  );
}

export async function withdrawTuitionOnsite(studentId: string, paymentId: string) {
  return settle(
    await mutateMobileApi<ParentTuitionWithdrawResponse | null>(`${BASE}/onsite-request`, 'DELETE', {
      studentId,
      paymentId,
    }),
  );
}

/** 결제사에 지금 상태를 물어 서버에 반영한다 (웹훅이 늦을 때를 대비) */
export async function syncTuitionInvoice(studentId: string, invoiceId: string) {
  return settle(
    await mutateMobileApi<ParentTuitionSyncResponse | null>(`${BASE}/sync`, 'POST', { studentId, invoiceId }),
  );
}
