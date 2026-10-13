// 개발 전용 모의 결제사 — 토스 계약·키 없이 수강료 흐름(결제·실패·중복·입금 대기·환불)을 로컬에서 돌려 본다.
// 운영에서는 절대 선택되지 않는다 (provider-registry.ts 가 NODE_ENV 로 막는다).
// 상태는 프로세스 메모리에만 있다 — dev 서버를 다시 띄우면 사라진다.

import { getAppUrl } from "@/lib/app-url";
import {
  ProviderError,
  providerCanceledAmount,
  type CancelOrderInput,
  type CreateLinkInput,
  type ProviderLink,
  type ProviderOrder,
  type TuitionProvider,
} from "@/lib/tuition/provider";

export type MockLink = {
  productKey: string;
  paymentId: string;
  name: string;
  amount: number;
  validThrough: Date;
  deleted: boolean;
};

export type MockCancelBehavior = "ok" | "reject" | "timeout";

type MockState = {
  links: Map<string, MockLink>;
  /** 멱등키(결제 행 id) → productKey */
  linkByPaymentId: Map<string, string>;
  orders: Map<string, ProviderOrder>;
  /** 취소 멱등키 → 그때의 주문 스냅샷 */
  cancelByKey: Map<string, string>;
  cancelBehavior: MockCancelBehavior;
  seq: number;
};

const globalForMock = globalThis as unknown as { __tuitionMockProvider?: MockState };

function state(): MockState {
  if (!globalForMock.__tuitionMockProvider) {
    globalForMock.__tuitionMockProvider = {
      links: new Map(),
      linkByPaymentId: new Map(),
      orders: new Map(),
      cancelByKey: new Map(),
      cancelBehavior: "ok",
      seq: 0,
    };
  }
  return globalForMock.__tuitionMockProvider;
}

function nextKey(prefix: string): string {
  const s = state();
  s.seq += 1;
  return `${prefix}_${Date.now().toString(36)}${s.seq.toString(36)}`;
}

/** 모의 결제 페이지 주소 */
export function mockPayPath(productKey: string): string {
  return `/api/webhooks/toss-mock?product=${encodeURIComponent(productKey)}`;
}

// ─── 모의 결제 페이지가 쓰는 조작 함수 ─────────────────────────────────

export function mockGetLink(productKey: string): { link: MockLink; orders: ProviderOrder[] } | null {
  const s = state();
  const link = s.links.get(productKey);
  if (!link) return null;
  return { link, orders: [...s.orders.values()].filter((o) => o.productKey === productKey) };
}

/**
 * 결제 시도.
 *  · card — 바로 결제 완료
 *  · virtual-account — 가상계좌 발급(입금 대기). mockDeposit 으로 입금 처리
 * ignoreStock=true 면 재고 1 제한을 무시한다 (중복 결제 재현용).
 */
export function mockPay(
  productKey: string,
  how: "card" | "virtual-account",
  options: { ignoreStock?: boolean } = {},
): ProviderOrder {
  const s = state();
  const link = s.links.get(productKey);
  if (!link || link.deleted) throw new ProviderError("판매가 종료된 결제 링크입니다", "rejected", "NOT_FOUND_PRODUCT");
  if (link.validThrough.getTime() < Date.now()) {
    throw new ProviderError("결제 기한이 지난 링크입니다", "rejected", "EXPIRED_PRODUCT");
  }
  const taken = [...s.orders.values()].some(
    (o) => o.productKey === productKey && (o.status === "DONE" || o.status === "WAITING_FOR_DEPOSIT"),
  );
  if (taken && !options.ignoreStock) {
    throw new ProviderError("이미 결제된 링크입니다", "rejected", "SOLD_OUT");
  }

  const order: ProviderOrder = {
    orderKey: nextKey("mock_order"),
    productKey,
    metaPaymentId: link.paymentId,
    amount: link.amount,
    status: how === "card" ? "DONE" : "WAITING_FOR_DEPOSIT",
    paymentKey: nextKey("mock_pay"),
    method: how === "card" ? "카드" : "가상계좌",
    approvedAt: how === "card" ? new Date() : null,
    receiptUrl: null,
    card:
      how === "card"
        ? { issuer: "모의카드", cardType: "신용", installmentMonths: 0, approvalNumber: String(10_000_000 + state().seq) }
        : null,
    cancels: [],
    virtualAccount:
      how === "virtual-account"
        ? { bank: "모의은행", accountNumber: "X1234567890", dueDate: new Date(Date.now() + 3 * 86_400_000) }
        : null,
  };
  s.orders.set(order.orderKey, order);
  return order;
}

/** 가상계좌 입금 처리 */
export function mockDeposit(orderKey: string): ProviderOrder {
  const order = state().orders.get(orderKey);
  if (!order) throw new ProviderError("주문을 찾을 수 없습니다", "rejected", "NOT_FOUND_ORDER");
  if (order.status !== "WAITING_FOR_DEPOSIT") {
    throw new ProviderError("입금 대기 중인 주문이 아닙니다", "rejected", "INVALID_STATUS");
  }
  order.status = "DONE";
  order.approvedAt = new Date();
  order.virtualAccount = null;
  return order;
}

/** 다음 취소(환불) 요청이 어떻게 끝날지 — 환불 실패·타임아웃 재현용 */
export function mockSetCancelBehavior(behavior: MockCancelBehavior) {
  state().cancelBehavior = behavior;
}

export function mockGetCancelBehavior(): MockCancelBehavior {
  return state().cancelBehavior;
}

/** 테스트용 초기화 */
export function mockReset() {
  globalForMock.__tuitionMockProvider = undefined;
}

// ─── TuitionProvider 구현 ──────────────────────────────────────────────

export function createMockProvider(): TuitionProvider {
  return {
    name: "mock",
    partialCancel: true,
    linkIsOrder: false,
    canNotify: false,
    testMode: true,

    async createLink(input: CreateLinkInput): Promise<ProviderLink> {
      const s = state();
      // 같은 결제 행으로 다시 부르면 처음 만든 링크를 돌려준다 (멱등키 동작)
      const existing = s.linkByPaymentId.get(input.paymentId);
      const productKey = existing ?? nextKey("mock_prod");
      if (!existing) {
        s.links.set(productKey, {
          productKey,
          paymentId: input.paymentId,
          name: input.name,
          amount: input.amount,
          validThrough: input.validThrough,
          deleted: false,
        });
        s.linkByPaymentId.set(input.paymentId, productKey);
      }
      const base = (input.baseUrl ?? getAppUrl()).replace(/\/$/, "");
      return { productKey, url: `${base}${mockPayPath(productKey)}` };
    },

    async deleteLink(productKey: string): Promise<void> {
      const link = state().links.get(productKey);
      if (link) link.deleted = true;
    },

    async getOrder(orderKey: string): Promise<ProviderOrder | null> {
      const order = state().orders.get(orderKey);
      return order ? structuredClone(order) : null;
    },

    async listRecentOrders(limit = 100): Promise<ProviderOrder[]> {
      return [...state().orders.values()]
        .slice(-limit)
        .reverse()
        .map((o) => structuredClone(o));
    },

    async cancelOrder(input: CancelOrderInput): Promise<ProviderOrder> {
      const s = state();
      const order = s.orders.get(input.orderKey);
      if (!order) throw new ProviderError("주문을 찾을 수 없습니다", "rejected", "NOT_FOUND_ORDER");

      // 같은 멱등키면 이미 반영된 결과를 그대로 돌려준다
      if (s.cancelByKey.has(input.idempotencyKey)) return structuredClone(order);

      const behavior = s.cancelBehavior;
      s.cancelBehavior = "ok"; // 한 번만 적용
      if (behavior === "reject") {
        throw new ProviderError("취소할 수 없는 결제입니다", "rejected", "NOT_CANCELABLE_PAYMENT");
      }

      const balance = order.amount - providerCanceledAmount(order);
      if (order.status === "WAITING_FOR_DEPOSIT") {
        // 입금 전 취소 — 돈이 오가지 않았으므로 금액 없이 끝낸다
        order.status = "CANCELED";
        order.virtualAccount = null;
      } else {
        if (order.status !== "DONE" && order.status !== "PARTIAL_CANCELED") {
          throw new ProviderError("취소할 수 없는 결제입니다", "rejected", "NOT_CANCELABLE_PAYMENT");
        }
        const amount = input.amount ?? balance;
        if (amount <= 0 || amount > balance) {
          throw new ProviderError("취소 가능 금액을 넘었습니다", "rejected", "NOT_CANCELABLE_AMOUNT");
        }
        order.cancels.push({
          transactionKey: nextKey("mock_tx"),
          amount,
          reason: input.reason,
          canceledAt: new Date(),
        });
        order.status = amount === balance ? "CANCELED" : "PARTIAL_CANCELED";
      }
      s.cancelByKey.set(input.idempotencyKey, order.orderKey);

      // 반영은 됐지만 응답을 못 받은 상황 — 호출 측은 재조회로 확정해야 한다
      if (behavior === "timeout") throw new ProviderError("결제사에 연결하지 못했습니다", "unavailable");
      return structuredClone(order);
    },
  };
}
