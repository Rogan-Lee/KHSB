// 수강료 공용 타입 — 코어(src/lib/tuition/*)·서버 액션·모바일 API·어드민 화면이 같이 쓴다.
// 서버 전용 모듈을 import 하지 않는다 (클라이언트 컴포넌트에서도 가져다 쓴다).

/** 처리한 직원 (이름은 스냅샷으로 저장) */
export type TuitionActor = { id: string; name: string | null };

export type TuitionErrorCode =
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "PERIOD_OVERLAP" // 같은 기간의 청구서가 이미 있음
  | "INVOICE_NOT_PAYABLE" // 취소됐거나 결제할 수 없는 상태
  | "ALREADY_PAID"
  | "ONSITE_REQUEST_EXISTS" // 현장 결제 신청이 걸려 있어 온라인 결제를 열 수 없음
  | "ONLINE_DISABLED" // 온라인 결제 미사용 (키 없음·스위치 꺼짐)
  | "PROVIDER_UNAVAILABLE" // 결제사 응답 없음 — 결과를 알 수 없음
  | "PROVIDER_REJECTED" // 결제사가 거절
  | "NOT_REFUNDABLE"
  | "REFUND_EXCEEDS" // 환불 가능 금액 초과
  | "REFUND_IN_PROGRESS" // 처리 중인 환불이 있음
  | "REFUND_NEEDS_ACCOUNT" // 가상계좌 결제 — 환불 계좌 필요
  | "BUSY" // 같은 학생의 다른 처리가 진행 중
  | "INTERNAL";

/** 코어가 던지는 업무 오류 — message 는 사용자에게 그대로 보여도 되는 한국어 문구 */
export class TuitionError extends Error {
  constructor(
    public readonly code: TuitionErrorCode,
    message: string,
    public readonly httpStatus: number = 400,
  ) {
    super(message);
    this.name = "TuitionError";
  }
}

/** 서버 액션 반환형 — 운영 빌드에서 throw 한 문구가 가려지지 않도록 결과로 돌려준다 */
export type TuitionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; code: TuitionErrorCode; error: string };

// ─── 변경 이력 ─────────────────────────────────────────────────────────

export type TuitionEventSource = "STAFF" | "PARENT" | "WEBHOOK" | "SYNC" | "CRON" | "SYSTEM";

export type TuitionEventType =
  | "INVOICE_ISSUED"
  | "INVOICE_CANCELED"
  | "INVOICE_DELETED"
  | "LINK_CREATED"
  | "LINK_FAILED"
  | "BILL_TALK_SENT"
  | "CHECKOUT_OPENED"
  | "DEPOSIT_WAITING"
  | "ONSITE_REQUESTED"
  | "ONSITE_WITHDRAWN"
  | "ONSITE_DISMISSED"
  | "PAYMENT_DONE"
  | "PAYMENT_DUPLICATE"
  | "PAYMENT_CLOSED"
  | "REFUND_REQUESTED"
  | "REFUND_DONE"
  | "REFUND_FAILED"
  | "REFUND_EXTERNAL"
  | "NOTICE_SENT"
  | "CASH_RECEIPT_REQUESTED"
  | "CASH_RECEIPT_ISSUED"
  | "CASH_RECEIPT_CANCELED"
  | "WEBHOOK_UNMATCHED";

/** 결제 행이 닫힌 사유 (TuitionPayment.closedReason) */
export type TuitionPaymentClosedReason =
  | "EXPIRED"
  | "REPLACED"
  | "INVOICE_PAID"
  | "INVOICE_CANCELED"
  | "ONSITE_REQUESTED"
  | "WITHDRAWN"
  | "DISMISSED";

export type OnsiteRequestMethod = "LOCAL_CURRENCY" | "ONSITE_CARD";
export type OnsiteConfirmMethod = "LOCAL_CURRENCY" | "ONSITE_CARD" | "CASH" | "TRANSFER";

/** 가상계좌 결제 환불 계좌 — 결제사에 전달만 하고 저장하지 않는다 */
export type TuitionRefundAccount = { bank: string; accountNumber: string; holderName: string };
