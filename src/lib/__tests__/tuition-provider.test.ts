import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMockProvider,
  mockDeposit,
  mockPay,
  mockReset,
  mockSetCancelBehavior,
} from "@/lib/tuition/mock-provider";
import { orderWasPaid, ProviderError, providerCancelKey, type ProviderOrder } from "@/lib/tuition/provider";
import { getTuitionProvider, isMockProviderEnabled } from "@/lib/tuition/provider-registry";
import { createTossLinkPayProvider, mapTossOrder, tossTestCode } from "@/lib/tuition/toss-linkpay";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const validThrough = new Date("2026-11-30T14:59:59.000Z");

describe("mapTossOrder", () => {
  it("결제 상태·취소 내역을 옮기고 구매자 개인정보는 옮기지 않는다", () => {
    const order = mapTossOrder({
      orderKey: "ord_1",
      amount: 690000,
      customerName: "구매자",
      customerPhoneNumber: "01000000000",
      metaFields: { p: "pay_row_1" },
      orderItems: [{ product: { productKey: "prod_1" }, quantity: 1 }],
      payment: {
        paymentKey: "pk_1",
        status: "PARTIAL_CANCELED",
        method: "카드",
        approvedAt: "2026-11-01T10:00:00+09:00",
        receipt: { url: "https://example.com/receipt" },
        cancels: [
          { transactionKey: "tx_1", cancelAmount: 100000, cancelReason: "부분 환불", canceledAt: "2026-11-02T10:00:00+09:00", cancelStatus: "DONE" },
          { transactionKey: "tx_2", cancelAmount: 50000, cancelStatus: "IN_PROGRESS" },
        ],
      },
    });
    expect(order).toMatchObject({
      orderKey: "ord_1",
      productKey: "prod_1",
      metaPaymentId: "pay_row_1",
      amount: 690000,
      status: "PARTIAL_CANCELED",
      paymentKey: "pk_1",
      method: "카드",
      receiptUrl: "https://example.com/receipt",
    });
    // 진행 중인 취소는 아직 반영하지 않는다
    expect(order?.cancels).toEqual([
      { transactionKey: "tx_1", amount: 100000, reason: "부분 환불", canceledAt: new Date("2026-11-02T01:00:00.000Z") },
    ]);
    expect(JSON.stringify(order)).not.toContain("01000000000");
    expect(JSON.stringify(order)).not.toContain("구매자");
  });

  it("결제 정보가 없으면 NONE, 가상계좌 발급이면 입금 안내를 담는다", () => {
    expect(mapTossOrder({ orderKey: "ord_2", amount: 1000 })?.status).toBe("NONE");
    const waiting = mapTossOrder({
      orderKey: "ord_3",
      amount: 1000,
      payment: {
        status: "WAITING_FOR_DEPOSIT",
        method: "가상계좌",
        approvedAt: null,
        virtualAccount: { bankCode: "20", accountNumber: "X123", dueDate: "2026-11-08T23:59:59+09:00" },
      },
    });
    expect(waiting?.status).toBe("WAITING_FOR_DEPOSIT");
    expect(waiting?.approvedAt).toBeNull();
    expect(waiting?.virtualAccount).toMatchObject({ bank: "20", accountNumber: "X123" });
    expect(mapTossOrder({ amount: 1000 })).toBeNull();
    expect(mapTossOrder({ orderKey: "ord_4", payment: { status: "EXPIRED" } })?.status).toBe("FAILED");
  });
});

describe("createTossLinkPayProvider", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("링크 생성 — Basic 인증(키 뒤 콜론), 멱등키, 재고 1, 결제 행 id 쿼리", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { productKey: "prod_1", url: "https://link.example/p/abc" }));
    const provider = createTossLinkPayProvider("test_sk_abc");
    const link = await provider.createLink({ paymentId: "pay_1", name: "홍*동 11월 수강료", amount: 690000, validThrough });

    expect(link).toEqual({ productKey: "prod_1", url: "https://link.example/p/abc?p=pay_1" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.tosspayments.com/v1/products");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("test_sk_abc:").toString("base64")}`);
    expect(headers["Idempotency-Key"]).toBe("pay_1");
    expect(JSON.parse(init.body as string)).toMatchObject({
      name: "홍*동 11월 수강료",
      amount: 690000,
      stock: { quantity: 1 },
      validThrough: "2026-11-30T23:59:59+09:00",
    });
  });

  it("4xx 는 다시 보내지 않고 거절로 돌려준다", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { code: "INVALID_REQUEST", message: "잘못된 요청입니다." }));
    const provider = createTossLinkPayProvider("test_sk_abc");
    await expect(
      provider.createLink({ paymentId: "pay_1", name: "n", amount: 1000, validThrough }),
    ).rejects.toMatchObject({ kind: "rejected", code: "INVALID_REQUEST" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("5xx·네트워크 오류는 같은 멱등키로 한 번 더 보내고, 계속 실패하면 결과 미확정으로 돌려준다", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(503, { code: "UNKNOWN", message: "일시적 오류" }))
      .mockRejectedValueOnce(new Error("network"));
    const provider = createTossLinkPayProvider("test_sk_abc");
    const error = await provider
      .cancelOrder({ orderKey: "ord_1", amount: 1000, reason: "환불", idempotencyKey: "refund:1" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).kind).toBe("unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const keys = fetchMock.mock.calls.map(
      ([, init]) => ((init as RequestInit).headers as Record<string, string>)["Idempotency-Key"],
    );
    expect(keys).toEqual(["refund:1", "refund:1"]);
  });

  it("취소 성공 응답의 본문을 읽지 못하면 거절이 아니라 결과 미확정으로 돌려준다", async () => {
    fetchMock.mockImplementation(async () => new Response("not json", { status: 200 }));
    const provider = createTossLinkPayProvider("test_sk_abc");
    await expect(
      provider.cancelOrder({ orderKey: "ord_1", amount: 1000, reason: "환불", idempotencyKey: "refund:9" }),
    ).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("에러 재현 헤더는 테스트 키에만 붙는다", async () => {
    vi.stubEnv("TOSS_TEST_CODE", "NOT_CANCELABLE_PAYMENT");
    fetchMock.mockImplementation(async () => jsonResponse(403, { code: "NOT_CANCELABLE_PAYMENT", message: "취소 할 수 없는 결제 입니다." }));

    await createTossLinkPayProvider("test_sk_abc").getOrder("ord_1").catch(() => undefined);
    await createTossLinkPayProvider("live_sk_abc").getOrder("ord_1").catch(() => undefined);
    const headers = fetchMock.mock.calls.map(([, init]) => (init as RequestInit).headers as Record<string, string>);
    expect(headers[0]["TossPayments-Test-Code"]).toBe("NOT_CANCELABLE_PAYMENT");
    expect(headers[1]["TossPayments-Test-Code"]).toBeUndefined();
    vi.unstubAllEnvs();

    expect(tossTestCode("test_sk_abc", "not a code!")).toBeNull();
    expect(tossTestCode("test_sk_abc", undefined)).toBeNull();
  });

  it("계약되지 않은 상점 키(403 FORBIDDEN_REQUEST)는 거절로 돌려준다", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(403, { code: "FORBIDDEN_REQUEST", message: "접근 가능한 MID가 아닙니다." }));
    await expect(
      createTossLinkPayProvider("test_sk_abc").createLink({ paymentId: "pay_1", name: "n", amount: 1000, validThrough }),
    ).rejects.toMatchObject({ kind: "rejected", code: "FORBIDDEN_REQUEST", message: "접근 가능한 MID가 아닙니다." });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("주문 조회 — 404 는 null", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { code: "NOT_FOUND_ORDER", message: "없음" }));
    const provider = createTossLinkPayProvider("test_sk_abc");
    expect(await provider.getOrder("ord_x")).toBeNull();
  });

  it("주문 취소 — 금액·환불 계좌를 전달하고, 금액을 생략하면 전액 취소로 보낸다", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(200, { orderKey: "ord_1", amount: 1000, payment: { status: "CANCELED" } }),
    );
    const provider = createTossLinkPayProvider("test_sk_abc");
    await provider.cancelOrder({
      orderKey: "ord_1",
      amount: 500,
      reason: "부분 환불",
      idempotencyKey: "refund:2",
      refundAccount: { bank: "국민", accountNumber: "123", holderName: "예금주" },
    });
    await provider.cancelOrder({ orderKey: "ord_1", reason: "결제 대기 종료", idempotencyKey: "void:ord_1" });

    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));
    expect(bodies[0]).toEqual({
      cancelReason: "부분 환불",
      cancelAmount: 500,
      refundReceiveAccount: { bank: "국민", accountNumber: "123", holderName: "예금주" },
    });
    expect(bodies[1]).toEqual({ cancelReason: "결제 대기 종료" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.tosspayments.com/v1/orders/ord_1/cancel");
  });
});

describe("모의 결제사", () => {
  beforeEach(() => mockReset());

  it("같은 결제 행으로 링크를 다시 만들면 같은 링크를 돌려준다", async () => {
    const provider = createMockProvider();
    const input = { paymentId: "pay_1", name: "n", amount: 1000, validThrough: new Date(Date.now() + 60_000), baseUrl: "http://localhost:3000" };
    const first = await provider.createLink(input);
    const second = await provider.createLink(input);
    expect(second).toEqual(first);
    expect(first.url).toContain("/api/webhooks/toss-mock?product=");
  });

  it("재고 1 — 두 번째 결제는 막히고, 폐기된 링크는 결제할 수 없다", async () => {
    const provider = createMockProvider();
    const { productKey } = await provider.createLink({ paymentId: "pay_1", name: "n", amount: 1000, validThrough: new Date(Date.now() + 60_000) });
    mockPay(productKey, "card");
    expect(() => mockPay(productKey, "card")).toThrow(ProviderError);
    expect(mockPay(productKey, "card", { ignoreStock: true }).status).toBe("DONE");
    await provider.deleteLink(productKey, { amount: 1000 });
    expect(() => mockPay(productKey, "card", { ignoreStock: true })).toThrow(ProviderError);
  });

  it("취소 — 같은 멱등키는 한 번만 반영, 타임아웃은 반영된 뒤 오류", async () => {
    const provider = createMockProvider();
    const { productKey } = await provider.createLink({ paymentId: "pay_1", name: "n", amount: 1000, validThrough: new Date(Date.now() + 60_000) });
    const order = mockPay(productKey, "card");
    await provider.cancelOrder({ orderKey: order.orderKey, amount: 300, reason: "r", idempotencyKey: "k1" });
    const again = await provider.cancelOrder({ orderKey: order.orderKey, amount: 300, reason: "r", idempotencyKey: "k1" });
    expect(again.cancels).toHaveLength(1);
    expect(again.status).toBe("PARTIAL_CANCELED");

    mockSetCancelBehavior("timeout");
    await expect(
      provider.cancelOrder({ orderKey: order.orderKey, amount: 700, reason: "r", idempotencyKey: "k2" }),
    ).rejects.toMatchObject({ kind: "unavailable" });
    expect((await provider.getOrder(order.orderKey))?.status).toBe("CANCELED");

    await expect(
      provider.cancelOrder({ orderKey: order.orderKey, amount: 1, reason: "r", idempotencyKey: "k3" }),
    ).rejects.toMatchObject({ kind: "rejected" });
  });

  it("가상계좌 — 입금 전 취소는 돈이 오간 기록(취소 내역)을 남기지 않는다", async () => {
    const provider = createMockProvider();
    const { productKey } = await provider.createLink({ paymentId: "pay_1", name: "n", amount: 1000, validThrough: new Date(Date.now() + 60_000) });
    const waiting = mockPay(productKey, "virtual-account");
    expect(waiting.status).toBe("WAITING_FOR_DEPOSIT");
    expect(waiting.approvedAt).toBeNull();
    const voided = await provider.cancelOrder({ orderKey: waiting.orderKey, reason: "닫기", idempotencyKey: "void:1" });
    expect(voided.status).toBe("CANCELED");
    expect(voided.cancels).toHaveLength(0);
    expect(() => mockDeposit(waiting.orderKey)).toThrow(ProviderError);
  });
});

describe("결제사 선택", () => {
  beforeEach(() => {
    // 결제선생 설정이 주변 환경에 있어도 이 테스트는 토스·모의 결제만 본다 (결제선생 선택은 tuition-payssam.test.ts)
    for (const key of ["PAYSSAM_API_KEY", "PAYSSAM_MEMBER", "PAYSSAM_MERCHANT", "PAYSSAM_BASE_URL"]) vi.stubEnv(key, "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("키가 없으면 온라인 결제 미사용, 개발에서만 모의 결제", () => {
    vi.stubEnv("TOSS_SECRET_KEY", "");
    vi.stubEnv("TUITION_PROVIDER", "");
    expect(getTuitionProvider()).toBeNull();

    vi.stubEnv("TUITION_PROVIDER", "mock");
    expect(getTuitionProvider()?.name).toBe("mock");
  });

  it("운영에서는 TUITION_PROVIDER=mock 이어도 모의 결제를 쓰지 않는다", () => {
    vi.stubEnv("TOSS_SECRET_KEY", "");
    vi.stubEnv("TUITION_PROVIDER", "mock");
    vi.stubEnv("NODE_ENV", "production");
    expect(isMockProviderEnabled()).toBe(false);
    expect(getTuitionProvider()).toBeNull();
  });

  it("시크릿 키가 있으면 토스", () => {
    vi.stubEnv("TOSS_SECRET_KEY", "test_sk_abc");
    vi.stubEnv("TUITION_PROVIDER", "");
    expect(getTuitionProvider()).toMatchObject({ name: "toss", partialCancel: true, linkIsOrder: false, testMode: true });
    vi.stubEnv("TOSS_SECRET_KEY", "live_sk_abc");
    expect(getTuitionProvider()?.testMode).toBe(false);
  });

  it("개발에서 TUITION_PROVIDER=mock 이면 키가 있어도 모의 결제", () => {
    vi.stubEnv("TOSS_SECRET_KEY", "test_sk_abc");
    vi.stubEnv("TUITION_PROVIDER", "mock");
    expect(getTuitionProvider()?.name).toBe("mock");
  });
});

describe("주문 판정", () => {
  const order = (patch: Partial<ProviderOrder>): ProviderOrder => ({
    orderKey: "ord_1",
    productKey: "prod_1",
    metaPaymentId: null,
    amount: 1000,
    status: "NONE",
    paymentKey: null,
    method: null,
    approvedAt: null,
    receiptUrl: null,
    cancels: [],
    virtualAccount: null,
    card: null,
    ...patch,
  });

  it("결제 완료·부분 취소는 돈을 받은 주문", () => {
    expect(orderWasPaid(order({ status: "DONE" }), false)).toBe(true);
    expect(orderWasPaid(order({ status: "PARTIAL_CANCELED" }), false)).toBe(true);
  });

  it("전액 취소 — 승인 시각이 있으면 받았다가 돌려준 것, 없으면 입금 전에 닫힌 가상계좌", () => {
    expect(orderWasPaid(order({ status: "CANCELED", approvedAt: new Date() }), false)).toBe(true);
    expect(orderWasPaid(order({ status: "CANCELED", approvedAt: null }), false)).toBe(false);
    // 우리 쪽에 이미 결제 완료로 잡혀 있었다면 받은 돈이다
    expect(orderWasPaid(order({ status: "CANCELED", approvedAt: null }), true)).toBe(true);
  });

  it("입금 대기·미결제·실패는 받은 돈이 없다", () => {
    expect(orderWasPaid(order({ status: "WAITING_FOR_DEPOSIT" }), false)).toBe(false);
    expect(orderWasPaid(order({ status: "NONE" }), true)).toBe(false);
    expect(orderWasPaid(order({ status: "FAILED" }), false)).toBe(false);
  });

  it("취소 거래 키 — 결제사 키가 없어도 같은 취소는 같은 값", () => {
    const canceledAt = new Date("2026-11-02T01:00:00.000Z");
    expect(providerCancelKey("ord_1", { transactionKey: "tx_1", amount: 100, reason: null, canceledAt })).toBe("tx_1");
    const a = providerCancelKey("ord_1", { transactionKey: null, amount: 100, reason: null, canceledAt });
    const b = providerCancelKey("ord_1", { transactionKey: null, amount: 100, reason: "다른 사유", canceledAt });
    expect(a).toBe(b);
    expect(a).not.toBe(providerCancelKey("ord_1", { transactionKey: null, amount: 200, reason: null, canceledAt }));
  });
});
