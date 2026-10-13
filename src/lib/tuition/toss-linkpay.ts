// 토스페이먼츠 링크페이 API 클라이언트 — 결제 링크(상품) 생성·폐기, 주문 조회·취소.
// 스펙: https://docs.tosspayments.com/reference/linkpay (2026-10 기준). 링크페이는 별도 계약 상품이다.
// 시크릿 키는 서버에서만 읽는다. 클라이언트 코드·NEXT_PUBLIC_* 에 두지 말 것.
//
// 2026-10-10 테스트 환경에서 확인한 것 (문서 공개 테스트 키):
//  · 링크페이 계약이 없는 상점 키로 부르면 403 FORBIDDEN_REQUEST("접근 가능한 MID가 아닙니다") — 테스트 키도 마찬가지.
//    성공 응답은 계약된 상점의 키가 있어야 받아 볼 수 있다.
//  · 테스트 키에는 TossPayments-Test-Code 헤더로 에러를 재현할 수 있다 (링크페이 경로도 동작). → TOSS_TEST_CODE
// 아직 확인하지 못한 것 (계약 후 그 상점의 테스트 키로 확인):
//  · validThrough 형식, 재고 1 설정 시 두 번째 결제 차단 여부
//  · 링크에 붙인 쿼리(p=결제 id)가 주문 metaFields 로 돌아오는지 — 안 돌아와도 productKey 로 매칭한다

import {
  ProviderError,
  type CancelOrderInput,
  type CreateLinkInput,
  type ProviderCancel,
  type ProviderCardInfo,
  type ProviderLink,
  type ProviderOrder,
  type ProviderOrderStatus,
  type TuitionProvider,
} from "@/lib/tuition/provider";

const API_BASE = "https://api.tosspayments.com";
const TIMEOUT_MS = 8_000;

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** KST 기준 ISO 8601 (yyyy-MM-dd'T'HH:mm:ss+09:00) — 토스 응답의 날짜 형식과 같다 */
function toKstIso(at: Date): string {
  return `${new Date(at.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 19)}+09:00`;
}

// 카드사 코드 → 이름 (토스페이먼츠 카드사 코드표). 표에 없으면 코드를 그대로 보여 준다.
const CARD_ISSUERS: Record<string, string> = {
  "3K": "기업BC", "46": "광주", "71": "롯데", "30": "KDB산업", "31": "BC", "51": "삼성", "38": "새마을금고",
  "41": "신한", "62": "신협", "36": "씨티", "33": "우리BC", W1: "우리", "37": "우체국", "39": "저축은행",
  "35": "전북", "42": "제주", "15": "카카오뱅크", "3A": "케이뱅크", "24": "토스뱅크", "21": "하나",
  "61": "현대", "11": "KB국민", "91": "NH농협", "34": "Sh수협",
};

function mapCard(payment: Json | null): ProviderCardInfo | null {
  const card = asRecord(payment?.card);
  const easyPay = asRecord(payment?.easyPay);
  if (!card && !easyPay) return null;
  const issuerCode = asString(card?.issuerCode);
  const installment = card?.installmentPlanMonths;
  return {
    issuer: (issuerCode ? (CARD_ISSUERS[issuerCode] ?? issuerCode) : null) ?? asString(easyPay?.provider),
    cardType: asString(card?.cardType),
    installmentMonths: typeof installment === "number" && Number.isInteger(installment) ? installment : null,
    approvalNumber: asString(card?.approveNo),
  };
}

function mapStatus(paymentStatus: string | null): ProviderOrderStatus {
  switch (paymentStatus) {
    case "DONE":
    case "WAITING_FOR_DEPOSIT":
    case "PARTIAL_CANCELED":
    case "CANCELED":
      return paymentStatus;
    case "ABORTED":
    case "EXPIRED":
      return "FAILED";
    default:
      return "NONE"; // 결제 정보 없음 · READY · IN_PROGRESS
  }
}

/** 토스 Order 객체 → ProviderOrder. 구매자 이름·전화번호 등 개인정보는 옮기지 않는다 */
export function mapTossOrder(raw: unknown): ProviderOrder | null {
  const order = asRecord(raw);
  const orderKey = asString(order?.orderKey);
  if (!order || !orderKey) return null;

  const payment = asRecord(order.payment);
  const items = Array.isArray(order.orderItems) ? order.orderItems : [];
  const product = asRecord(asRecord(items[0])?.product);
  const meta = asRecord(order.metaFields);
  const cancels: ProviderCancel[] = (Array.isArray(payment?.cancels) ? payment.cancels : [])
    .map((c) => asRecord(c))
    .filter((c): c is Json => c !== null)
    // 취소 요청이 진행 중인 건은 아직 반영하지 않는다
    .filter((c) => c.cancelStatus === undefined || c.cancelStatus === "DONE")
    .map((c) => ({
      transactionKey: asString(c.transactionKey),
      amount: asNumber(c.cancelAmount),
      reason: asString(c.cancelReason),
      canceledAt: asDate(c.canceledAt),
    }));
  const va = asRecord(payment?.virtualAccount);

  return {
    orderKey,
    productKey: asString(product?.productKey),
    metaPaymentId: asString(meta?.p),
    amount: asNumber(order.amount),
    status: mapStatus(asString(payment?.status)),
    paymentKey: asString(payment?.paymentKey),
    method: asString(payment?.method),
    approvedAt: asDate(payment?.approvedAt),
    receiptUrl: asString(asRecord(payment?.receipt)?.url),
    card: mapCard(payment),
    cancels,
    virtualAccount: va
      ? {
          bank: asString(va.bankCode) ?? asString(va.bank),
          accountNumber: asString(va.accountNumber),
          dueDate: asDate(va.dueDate),
        }
      : null,
  };
}

/**
 * 테스트 환경 에러 재현 — 테스트 시크릿 키일 때만 TossPayments-Test-Code 헤더를 붙인다.
 * (예: TOSS_TEST_CODE=NOT_CANCELABLE_PAYMENT 로 환불 거절을, PROVIDER_ERROR 로 결제사 장애를 재현)
 * 라이브 키에서는 절대 보내지 않는다 — 토스도 무시하지만 운영 요청에 시험용 헤더가 섞이지 않게 여기서 막는다.
 */
export function tossTestCode(secretKey: string, value: string | undefined = process.env.TOSS_TEST_CODE): string | null {
  const code = value?.trim();
  if (!code || !secretKey.startsWith("test_")) return null;
  return /^[A-Z0-9_]{3,80}$/.test(code) ? code : null;
}

export function createTossLinkPayProvider(secretKey: string): TuitionProvider {
  // Basic 인증 — 시크릿 키 뒤에 콜론을 붙여 base64
  const authorization = `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;

  /**
   * retry=true 는 같은 요청을 다시 보내도 안전할 때만 (GET, 멱등키가 붙은 POST, DELETE).
   * 4xx 는 다시 보내지 않는다 — 명확한 거절이다.
   */
  async function request(
    method: "GET" | "POST" | "DELETE",
    path: string,
    options: { body?: Json; idempotencyKey?: string; retry?: boolean } = {},
  ): Promise<{ status: number; data: unknown }> {
    const attempts = options.retry ? 2 : 1;
    // 요청마다 읽는다 — dev 서버를 다시 띄우지 않고 에러 재현을 켜고 끌 수 있게
    const testCode = tossTestCode(secretKey);
    let lastError: ProviderError | null = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await fetch(`${API_BASE}${path}`, {
          method,
          headers: {
            Authorization: authorization,
            // 오류 문구를 어드민에 그대로 보여 주므로 한국어로 받는다 (없으면 일부 오류가 영어로 온다)
            "Accept-Language": "ko-KR",
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
            ...(testCode ? { "TossPayments-Test-Code": testCode } : {}),
          },
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const data: unknown = await response.json().catch(() => null);
        if (response.ok) return { status: response.status, data };

        const error = asRecord(data);
        const code = asString(error?.code);
        const message = asString(error?.message) ?? `결제사 응답 오류 (${response.status})`;
        if (response.status === 429 || response.status >= 500) {
          lastError = new ProviderError(message, "unavailable", code);
        } else {
          // 404 는 호출 측이 "없음"으로 다루도록 그대로 돌려준다
          if (response.status === 404) return { status: 404, data };
          throw new ProviderError(message, "rejected", code);
        }
      } catch (error) {
        if (error instanceof ProviderError && error.kind === "rejected") throw error;
        lastError =
          error instanceof ProviderError
            ? error
            : new ProviderError("결제사에 연결하지 못했습니다", "unavailable");
      }
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 400));
    }
    throw lastError ?? new ProviderError("결제사에 연결하지 못했습니다", "unavailable");
  }

  return {
    name: "toss",
    partialCancel: true,
    linkIsOrder: false,
    canNotify: false,
    testMode: secretKey.startsWith("test_"),

    async createLink(input: CreateLinkInput): Promise<ProviderLink> {
      const { status, data } = await request("POST", "/v1/products", {
        body: {
          name: input.name,
          amount: input.amount,
          ...(input.description ? { description: input.description } : {}),
          // 한 번만 결제되도록 재고 1 — 두 번째 결제는 결제사에서 막히길 기대하되, 우리 쪽에서도 따로 막는다
          stock: { quantity: 1 },
          validThrough: toKstIso(input.validThrough),
          useMemo: false,
        },
        idempotencyKey: input.paymentId,
        retry: true,
      });
      const product = asRecord(data);
      const productKey = asString(product?.productKey);
      const url = asString(product?.url);
      if (status === 404 || !productKey || !url) {
        throw new ProviderError("결제 링크를 만들지 못했습니다", "unavailable");
      }
      const separator = url.includes("?") ? "&" : "?";
      return { productKey, url: `${url}${separator}p=${encodeURIComponent(input.paymentId)}` };
    },

    async deleteLink(productKey: string): Promise<void> {
      await request("DELETE", `/v1/products/${encodeURIComponent(productKey)}`, { retry: true });
    },

    async getOrder(orderKey: string): Promise<ProviderOrder | null> {
      const { status, data } = await request("GET", `/v1/orders/${encodeURIComponent(orderKey)}`, {
        retry: true,
      });
      return status === 404 ? null : mapTossOrder(data);
    },

    async listRecentOrders(limit = 100): Promise<ProviderOrder[]> {
      const { status, data } = await request("GET", `/v1/orders?limit=${Math.min(Math.max(limit, 1), 100)}`, {
        retry: true,
      });
      if (status === 404 || !Array.isArray(data)) return [];
      return data.map(mapTossOrder).filter((o): o is ProviderOrder => o !== null);
    },

    async cancelOrder(input: CancelOrderInput): Promise<ProviderOrder> {
      const { status, data } = await request("POST", `/v1/orders/${encodeURIComponent(input.orderKey)}/cancel`, {
        body: {
          cancelReason: input.reason.slice(0, 200),
          ...(input.amount !== undefined ? { cancelAmount: input.amount } : {}),
          ...(input.refundAccount ? { refundReceiveAccount: input.refundAccount } : {}),
        },
        idempotencyKey: input.idempotencyKey,
        retry: true,
      });
      if (status === 404) throw new ProviderError("취소할 주문을 찾지 못했습니다", "rejected", "NOT_FOUND_ORDER");
      const order = mapTossOrder(data);
      // 성공 응답인데 본문을 읽지 못했다 — 취소는 반영됐을 수 있으니 거절로 단정하지 않는다 (재조회로 확정)
      if (!order) throw new ProviderError("결제사 응답을 확인하지 못했습니다", "unavailable");
      return order;
    },
  };
}
