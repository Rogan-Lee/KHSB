// 결제사 연동 인터페이스 — 수강료 코어는 이 타입만 안다 (결제선생 / 토스 링크페이 / 개발용 모의 결제).
// 여기에는 구현을 두지 않는다. 구현 선택은 provider-registry.ts.
//
// 결제사마다 다른 점은 아래 세 가지 성질로만 드러낸다 (코어는 결제사 이름으로 분기하지 않는다):
//  · partialCancel — 결제 금액 일부만 취소할 수 있는지
//  · linkIsOrder   — 결제 링크 하나가 곧 주문 하나인지 (주문 목록 API 가 없어 링크 키로 조회한다)
//  · canNotify     — 결제사가 학부모에게 직접 알림(카카오 알림톡 청구서)을 보내 줄 수 있는지

/** 결제사 주문의 결제 상태. 결제 정보가 아직 없으면 NONE */
export type ProviderOrderStatus =
  | "NONE"
  | "WAITING_FOR_DEPOSIT" // 가상계좌 발급 — 입금 대기
  | "DONE"
  | "PARTIAL_CANCELED"
  | "CANCELED"
  | "FAILED"; // 중단·만료 등 결제되지 않고 끝남

export type ProviderCancel = {
  /** 취소 거래 키 — 같은 취소를 두 번 반영하지 않기 위한 식별자 */
  transactionKey: string | null;
  amount: number;
  reason: string | null;
  canceledAt: Date | null;
};

export type ProviderCardInfo = {
  /** 카드사·간편결제사 이름 */
  issuer: string | null;
  /** "신용" · "체크" 등 */
  cardType: string | null;
  /** 할부 개월 (0 = 일시불) */
  installmentMonths: number | null;
  approvalNumber: string | null;
};

export type ProviderOrder = {
  orderKey: string;
  /** 주문이 발생한 결제 링크(상품) 키 */
  productKey: string | null;
  /** 결제 링크에 실어 보낸 우리 결제 행 id (metaFields.p) */
  metaPaymentId: string | null;
  amount: number;
  status: ProviderOrderStatus;
  paymentKey: string | null;
  /** 결제수단 표시명 — "카드" · "가상계좌" · "간편결제" 등 */
  method: string | null;
  approvedAt: Date | null;
  receiptUrl: string | null;
  /** 승인 정보 — 대사·문의 대응용. 카드번호는 받지 않는다 */
  card: ProviderCardInfo | null;
  cancels: ProviderCancel[];
  /** 가상계좌 입금 안내 (입금 대기일 때만) */
  virtualAccount: { bank: string | null; accountNumber: string | null; dueDate: Date | null } | null;
  /** 결제되지 않은 채 결제 링크가 닫혔다 (결제사에서 청구서 파기) — 이 링크로는 더 결제할 수 없다 */
  linkClosed?: boolean;
};

/** url 이 null 이면 결제사가 알림만 보내고 주소는 돌려주지 않은 것 (알림 발송 방식에서만) */
export type ProviderLink = { productKey: string; url: string | null };

export type CreateLinkInput = {
  /** 우리 결제 행 id — 멱등키이자 주문 매칭용 */
  paymentId: string;
  name: string;
  amount: number;
  description?: string;
  /** 이 시각 이후로는 결제할 수 없다 */
  validThrough: Date;
  /** 모의 결제 페이지·콜백 주소를 만들 때 쓰는 서버 주소 (운영에서는 쓰지 않는다) */
  baseUrl?: string;
  /** 청구서 제목 — 결제사가 청구 사유로 보여 준다 ("11월 수강료") */
  title?: string;
  /**
   * 청구 대상 — 결제사가 청구서에 고객명으로 표시하고, 알림 발송 방식이면 이 번호로 알림을 보낸다.
   * key 는 번호를 쓸 수 없을 때 대신 쓰는 고객 식별자 (학생 id).
   */
  customer?: { name: string; phone: string | null; key: string };
  /** 학부모 안내 메시지 */
  message?: string;
  /** 결제가 끝난 뒤 돌아올 주소 (지원하는 결제사만) */
  returnUrl?: string;
  /** true 면 결제사가 학부모에게 직접 알림(카카오 알림톡 청구서)을 보낸다 — canNotify 인 결제사만 */
  notify?: boolean;
};

/** 결제 링크를 폐기할 때 결제사가 요구하는 값 */
export type DeleteLinkContext = { amount: number };

export type CancelOrderInput = {
  orderKey: string;
  /** 취소 금액. 생략하면 전액 — 입금 전 가상계좌 주문을 닫을 때 쓴다 */
  amount?: number;
  reason: string;
  /** 같은 키로 다시 보내면 결제사가 첫 응답을 돌려준다 (15일) */
  idempotencyKey: string;
  /** 가상계좌 결제 환불 계좌 — 저장하지 않고 결제사에 전달만 한다 */
  refundAccount?: { bank: string; accountNumber: string; holderName: string };
};

export interface TuitionProvider {
  readonly name: "toss" | "mock" | "payssam";
  /** 결제 금액 일부만 취소할 수 있는지. false 면 전액 취소만 된다 — 부분 환불은 직접 돌려준 뒤 기록한다 */
  readonly partialCancel: boolean;
  /**
   * 결제 링크 키가 곧 주문 키인 결제사 (링크 하나에 결제 한 건, 주문 목록 API 없음).
   * true 면 아직 결제되지 않은 링크도 getOrder(링크 키)로 상태를 조회한다.
   */
  readonly linkIsOrder: boolean;
  /** 결제사가 학부모에게 직접 알림(카카오 알림톡 청구서)을 보내 줄 수 있는지 */
  readonly canNotify: boolean;
  /** 시험 환경(테스트 키·개발 서버·모의 결제)인지 — 어드민에 표시해 운영 결제와 헷갈리지 않게 한다 */
  readonly testMode: boolean;
  /** 알림 발송에 쓰는 선불 포인트 잔액과 충전 주소 (포인트를 쓰는 결제사만) */
  getBalance?(): Promise<{ balance: number | null; chargeUrl: string | null }>;
  /**
   * 결제 링크 키를 결제사 호출 전에 정할 수 있으면 그 값.
   * 결제 행에 미리 적어 두면, 생성 응답을 못 받았어도 뒤늦게 들어온 결제를 그 행과 이을 수 있다.
   */
  linkKeyFor?(paymentId: string, options?: { notify?: boolean }): string;
  /** 알림 발송 방식으로 만든 링크인지 (canNotify 인 결제사만) */
  isNotifyLink?(productKey: string): boolean;
  createLink(input: CreateLinkInput): Promise<ProviderLink>;
  /** 결제 링크 폐기. 이미 없으면 성공으로 본다 */
  deleteLink(productKey: string, context: DeleteLinkContext): Promise<void>;
  /** 이미 보낸 알림을 다시 보낸다 (canNotify 인 결제사만). 결제사에 그 링크가 없으면 code "LINK_NOT_FOUND" 로 거절한다 */
  resendLink?(productKey: string): Promise<void>;
  /** 주문 단건 조회. 없으면 null */
  getOrder(orderKey: string): Promise<ProviderOrder | null>;
  /** 최근 주문 목록 (대조·동기화용). 목록 API 가 없는 결제사는 빈 배열 */
  listRecentOrders(limit?: number): Promise<ProviderOrder[]>;
  /** 주문 취소(환불). 반영된 뒤의 주문을 돌려준다 */
  cancelOrder(input: CancelOrderInput): Promise<ProviderOrder>;
}

/**
 * 결제사 호출 실패.
 *  · rejected — 결제사가 명확히 거절(4xx). 반영되지 않았다고 확정할 수 있다.
 *  · unavailable — 타임아웃·5xx·네트워크. 반영 여부를 알 수 없으므로 재조회로 확정해야 한다.
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly kind: "rejected" | "unavailable",
    public readonly code: string | null = null,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** 결제사가 돈을 받은 적이 있는 주문인지 (받고 나서 취소된 것 포함). 입금 전에 닫힌 가상계좌는 아니다 */
export function orderWasPaid(order: ProviderOrder, rowAlreadyDone: boolean): boolean {
  if (order.status === "DONE" || order.status === "PARTIAL_CANCELED") return true;
  // 전액 취소 — 승인 시각이 있으면 받았다가 돌려준 것, 없으면 입금 전 가상계좌를 닫은 것
  if (order.status === "CANCELED") return rowAlreadyDone || order.approvedAt !== null;
  return false;
}

/** 취소 거래 식별자 — 결제사 키가 없으면 주문·시각·금액으로 만든다 (같은 취소는 항상 같은 값) */
export function providerCancelKey(orderKey: string, cancel: ProviderCancel): string {
  return cancel.transactionKey ?? `nokey:${orderKey}:${cancel.canceledAt?.getTime() ?? 0}:${cancel.amount}`;
}

/** 누적 취소 금액 */
export function providerCanceledAmount(order: ProviderOrder): number {
  return order.cancels.reduce((sum, c) => sum + c.amount, 0);
}
