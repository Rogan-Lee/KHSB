import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 결제선생 연동 — 문서(developers.payssam.kr v2)를 읽은 대로 만든 클라이언트·어댑터를,
// 같은 문서대로 만든 모의 서버(payssam-mock.ts)에 붙여 돌려 본다. 실제 결제선생과의 대조는 개발 키를 받은 뒤
// scripts/check-payssam.ts 로 한다.

import {
  createPayssamClient,
  createPayssamProvider,
  loadPayssamConfig,
  mapPayssamBill,
  mapPayssamCashReceipt,
  parsePayssamDateTime,
  payssamCashReceiptKey,
  payssamBillId,
  payssamHash,
  PAYSSAM_SANDBOX_URL,
  type PayssamConfig,
} from "@/lib/tuition/payssam";
import {
  createPayssamMockFetch,
  payssamMockCashReceipt,
  payssamMockGet,
  payssamMockManagerCancel,
  payssamMockManagerDestroy,
  payssamMockPay,
  payssamMockPoints,
  payssamMockReset,
  payssamMockSetFault,
  payssamMockSetPoints,
} from "@/lib/tuition/payssam-mock";
import { ProviderError } from "@/lib/tuition/provider";
import { getTuitionProvider, isPayssamMockEnabled } from "@/lib/tuition/provider-registry";

const BASE = "http://payssam.test/partner";

const CONFIG: PayssamConfig = {
  apiKey: "test-api-key",
  member: "member-1",
  merchant: "merchant-1",
  baseUrl: BASE,
  appUrl: "https://app.example.com",
  callbackToken: "cb-token",
  billIssuer: "강한선배",
  billPrefix: "",
  talk: true,
};

const VALID_THROUGH = new Date("2026-11-20T03:00:00.000Z");

function provider(patch: Partial<PayssamConfig> = {}) {
  return createPayssamProvider({ ...CONFIG, ...patch }, { fetch: createPayssamMockFetch(BASE) });
}

function linkInput(paymentId: string, patch: Record<string, unknown> = {}) {
  return {
    paymentId,
    name: "김*생 11월 수강료",
    amount: 690_000,
    validThrough: VALID_THROUGH,
    title: "11월 수강료",
    customer: { name: "김학생", phone: "010-1234-5678", key: "student-1" },
    message: "교재비가 포함됐어요",
    returnUrl: "https://app.example.com/bill/tok",
    ...patch,
  };
}

async function rejection(promise: Promise<unknown>): Promise<ProviderError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(error instanceof ProviderError)) throw new Error("ProviderError 가 던져지지 않았습니다");
  return error;
}

beforeEach(() => {
  payssamMockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("billId · hash · 날짜", () => {
  it("billId 는 20자 이내 영문 소문자·숫자이고, 같은 결제 행은 항상 같은 값", () => {
    const id = payssamBillId("", "cmv2mfv4c0003p4ccus7euwqu", false);
    expect(id).toMatch(/^u[0-9a-z]{19}$/);
    expect(payssamBillId("", "cmv2mfv4c0003p4ccus7euwqu", false)).toBe(id);
    expect(payssamBillId("", "cmv2mfv4c0003p4ccus7euwqv", false)).not.toBe(id);
  });

  it("알림톡용은 t 로 시작해 주소만 받는 청구서(u)와 구분된다", () => {
    const url = payssamBillId("", "pay-1", false);
    const talk = payssamBillId("", "pay-1", true);
    expect(talk.charAt(0)).toBe("t");
    expect(talk.slice(1)).toBe(url.slice(1));
    const p = provider();
    expect(p.isNotifyLink?.(talk)).toBe(true);
    expect(p.isNotifyLink?.(url)).toBe(false);
  });

  it("접두어(개발 환경의 사업자등록번호 10자리)를 붙여도 20자를 넘지 않는다", () => {
    const id = payssamBillId("1234567890", "pay-1", true);
    expect(id).toMatch(/^1234567890t[0-9a-z]{9}$/);
    expect(provider({ billPrefix: "1234567890" }).isNotifyLink?.(id)).toBe(true);
    expect(provider({ billPrefix: "1234567890" }).linkKeyFor?.("pay-1", { notify: true })).toBe(id);
  });

  it("hash 는 값을 쉼표로 이은 문자열의 SHA-256 (16진 소문자)", () => {
    // sha256("bill-1,01012345678,690000")
    expect(payssamHash(["bill-1", "01012345678", "690000"])).toBe(
      "0c26b4a42811b1af5e824635465c8331512bad5e11a715773140fc0e5c210478",
    );
    expect(payssamHash(["a", "b"])).toBe(payssamHash(["a,b"]));
  });

  it("yyyyMMddHHmmss 는 KST 로 읽는다", () => {
    expect(parsePayssamDateTime("20261101093000")?.toISOString()).toBe("2026-11-01T00:30:00.000Z");
    expect(parsePayssamDateTime("2026-11-01")).toBeNull();
    expect(parsePayssamDateTime(null)).toBeNull();
  });
});

describe("loadPayssamConfig", () => {
  const env = (patch: Record<string, string | undefined>) =>
    ({ NODE_ENV: "development", PAYSSAM_API_KEY: "k", PAYSSAM_MEMBER: "m", PAYSSAM_MERCHANT: "s", ...patch }) as NodeJS.ProcessEnv;

  it("키·사용자 코드·매장 코드가 다 있어야 한다", () => {
    expect(loadPayssamConfig(env({ PAYSSAM_MERCHANT: "" }), "https://app.example.com")).toBeNull();
    expect(loadPayssamConfig(env({ PAYSSAM_API_KEY: undefined }), "https://app.example.com")).toBeNull();
  });

  it("주소를 정하지 않으면 개발 환경(sandbox)으로 간다", () => {
    expect(loadPayssamConfig(env({}), "https://app.example.com/")).toMatchObject({
      baseUrl: PAYSSAM_SANDBOX_URL,
      appUrl: "https://app.example.com",
      talk: false,
      callbackToken: null,
      billIssuer: null,
      billPrefix: "",
    });
  });

  it("운영에서는 주소를 반드시 정해야 한다 — 모르는 채로 개발 주소에 보내지 않는다", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(loadPayssamConfig(env({ NODE_ENV: "production" }), "https://app.example.com")).toBeNull();
    expect(
      loadPayssamConfig(env({ NODE_ENV: "production", PAYSSAM_BASE_URL: "https://live.example.com/partner/" }), "https://app.example.com"),
    ).toMatchObject({ baseUrl: "https://live.example.com/partner" });
    expect(logged).toHaveBeenCalledTimes(1);
  });

  it("접두어·주소 형식이 틀리면 연동을 켜지 않는다", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(loadPayssamConfig(env({ PAYSSAM_BILL_PREFIX: "12345678901" }), "https://app.example.com")).toBeNull();
    expect(loadPayssamConfig(env({ PAYSSAM_BILL_PREFIX: "123-45" }), "https://app.example.com")).toBeNull();
    expect(loadPayssamConfig(env({ PAYSSAM_BASE_URL: "sandbox.paymint.co.kr" }), "https://app.example.com")).toBeNull();
  });

  it("알림톡은 PAYSSAM_TALK=1 일 때만", () => {
    expect(loadPayssamConfig(env({ PAYSSAM_TALK: "1" }), "https://app.example.com")?.talk).toBe(true);
    expect(loadPayssamConfig(env({ PAYSSAM_TALK: "true" }), "https://app.example.com")?.talk).toBe(false);
  });
});

describe("청구서 조회 응답 → 주문", () => {
  it("미결제(W)는 결제 정보 없음", () => {
    expect(mapPayssamBill("b1", { billId: "b1", apprState: "W" })).toMatchObject({
      orderKey: "b1",
      productKey: "b1",
      status: "NONE",
      amount: 0,
      approvedAt: null,
      cancels: [],
    });
  });

  it("결제완료(F) — 금액·승인 정보를 옮기고 카드번호는 옮기지 않는다", () => {
    const order = mapPayssamBill("b1", {
      apprState: "F",
      apprPrice: "690000",
      apprDt: "20261101093000",
      apprOriginDt: "20261101093000",
      apprPayType: "CARD_VAN",
      apprCardType: "신용",
      apprIssuer: "현대카드",
      apprIssuerNum: "4321-****-****-1234",
      apprNum: "30000001",
      apprOriginNum: "30000001",
      apprMonthly: "3",
    });
    expect(order).toMatchObject({
      status: "DONE",
      amount: 690_000,
      method: "카드",
      paymentKey: null,
      card: { issuer: "현대카드", cardType: "신용", installmentMonths: 3, approvalNumber: "30000001" },
    });
    expect(order.approvedAt?.toISOString()).toBe("2026-11-01T00:30:00.000Z");
    expect(JSON.stringify(order)).not.toContain("4321");
  });

  it("취소(C) — 결제됐다가 전액 취소된 것. 취소 거래 키는 다시 조회해도 같다", () => {
    const raw = {
      apprState: "C",
      apprPrice: "690000",
      apprDt: "20261105120000",
      apprOriginDt: "20261101093000",
      apprNum: "30000002",
      apprOriginNum: "30000001",
      apprIssuer: "현대카드",
      apprCardType: "정보없음",
    };
    const order = mapPayssamBill("b1", raw);
    expect(order.status).toBe("CANCELED");
    expect(order.approvedAt?.toISOString()).toBe("2026-11-01T00:30:00.000Z");
    expect(order.cancels).toEqual([
      { transactionKey: "payssam-cancel:b1", amount: 690_000, reason: null, canceledAt: new Date("2026-11-05T03:00:00.000Z") },
    ]);
    expect(order.card).toMatchObject({ cardType: null, approvalNumber: "30000001" });
    expect(mapPayssamBill("b1", raw).cancels[0].transactionKey).toBe(order.cancels[0].transactionKey);
  });

  it("파기(D)는 결제되지 않고 끝난 청구서 — 링크가 닫혔다고 알린다", () => {
    expect(mapPayssamBill("b1", { apprState: "D" })).toMatchObject({ status: "FAILED", linkClosed: true, cancels: [] });
  });
});

describe("결제선생 어댑터 (모의 서버)", () => {
  it("성질 — 전액 취소만, 링크가 곧 주문, 알림톡은 설정에 따라", () => {
    expect(provider()).toMatchObject({ name: "payssam", partialCancel: false, linkIsOrder: true, canNotify: true });
    expect(provider({ talk: false }).canNotify).toBe(false);
    expect(createPayssamProvider({ ...CONFIG, baseUrl: PAYSSAM_SANDBOX_URL }).testMode).toBe(true);
    expect(createPayssamProvider({ ...CONFIG, baseUrl: "https://live.example.com/partner" }).testMode).toBe(false);
  });

  it("주소만 받는 청구서(URL) — 결제 주소를 돌려주고, 콜백·돌아올 주소·발급처·유효기간을 싣는다", async () => {
    const p = provider();
    const link = await p.createLink(linkInput("pay-1"));
    const billId = payssamBillId("", "pay-1", false);

    expect(link.productKey).toBe(billId);
    expect(link.url).toContain(`/pay/${billId}`);
    expect(payssamMockGet(billId)).toMatchObject({
      sendType: "URL",
      productName: "11월 수강료",
      memberName: "김학생",
      phone: "01012345678",
      price: 690_000,
      message: "교재비가 포함됐어요",
      callbackUrl: "https://app.example.com/api/webhooks/payssam?k=cb-token",
      pageRedirectUrl: "https://app.example.com/bill/tok",
      state: "W",
      talkCount: 0,
    });
    expect(payssamMockPoints()).toBe(100);
  });

  it("요청 본문 — 문서의 필드 이름·hash 규칙·유효기간 형식 그대로", async () => {
    const sent: { url: string; body: Record<string, unknown> }[] = [];
    const mock = createPayssamMockFetch(BASE);
    const p = createPayssamProvider(CONFIG, {
      fetch: (url, init) => {
        sent.push({ url, body: JSON.parse(String(init.body)) });
        return mock(url, init);
      },
    });
    await p.createLink(linkInput("pay-1"));
    const billId = payssamBillId("", "pay-1", false);

    expect(sent[0].url).toBe(`${BASE}/bill`);
    expect(sent[0].body).toEqual({
      apiKey: "test-api-key",
      member: "member-1",
      merchant: "merchant-1",
      bill: {
        billId,
        sendType: "URL",
        billIssuer: "강한선배",
        productName: "11월 수강료",
        price: "690000",
        memberName: "김학생",
        phone: "01012345678",
        message: "교재비가 포함됐어요",
        // 2026-11-20 12:00 KST
        expireDt: "2026-11-20",
        hash: payssamHash([billId, "01012345678", "690000"]),
        callbackUrl: "https://app.example.com/api/webhooks/payssam?k=cb-token",
        pageRedirectUrl: "https://app.example.com/bill/tok",
      },
    });
  });

  it("번호가 휴대폰 형식이 아니면 주소만 받는 방식은 고객 식별자로 보낸다", async () => {
    const p = provider();
    await p.createLink(linkInput("pay-1", { customer: { name: "김학생", phone: "000-0000-0000", key: "student-1" } }));
    expect(payssamMockGet(payssamBillId("", "pay-1", false))?.phone).toBe("student-1");
  });

  it("알림톡 청구서(TALK) — 포인트가 차감되고, 번호가 없으면 결제사를 부르지 않는다", async () => {
    const p = provider();
    const link = await p.createLink(linkInput("pay-1", { notify: true }));
    const billId = payssamBillId("", "pay-1", true);
    expect(link.productKey).toBe(billId);
    expect(payssamMockGet(billId)).toMatchObject({ sendType: "TALK", talkCount: 1, pageRedirectUrl: null });
    expect(payssamMockPoints()).toBe(99);

    const error = await rejection(
      p.createLink(linkInput("pay-2", { notify: true, customer: { name: "김학생", phone: "02-123-4567", key: "s" } })),
    );
    expect(error).toMatchObject({ kind: "rejected", code: "INVALID_PHONE" });
    expect(payssamMockGet(payssamBillId("", "pay-2", true))).toBeNull();
  });

  it("알림톡을 쓰지 않는 설정이면 알림톡 청구서를 만들지 않는다", async () => {
    const error = await rejection(provider({ talk: false }).createLink(linkInput("pay-1", { notify: true })));
    expect(error).toMatchObject({ kind: "rejected", code: "TALK_DISABLED" });
  });

  it("포인트가 부족하면 알림톡 발송은 거절된다 (사유를 그대로 전한다)", async () => {
    payssamMockSetPoints(0);
    const error = await rejection(provider().createLink(linkInput("pay-1", { notify: true })));
    expect(error).toMatchObject({ kind: "rejected", code: "POINT_001", message: "포인트가 부족합니다" });
  });

  it("응답을 못 받은 뒤 다시 만들면 — 주소만 받는 청구서는 파기하고 거절(새 결제 행으로 다시), 알림톡은 이미 나간 것으로 본다", async () => {
    const p = provider();
    payssamMockSetFault("timeout");
    expect(await rejection(p.createLink(linkInput("pay-1")))).toMatchObject({ kind: "unavailable" });
    const urlBill = payssamBillId("", "pay-1", false);
    expect(payssamMockGet(urlBill)?.state).toBe("W");

    expect(await rejection(p.createLink(linkInput("pay-1")))).toMatchObject({ kind: "rejected", code: "BILL_001" });
    // 아무도 열 수 없는 청구서가 남지 않는다
    expect(payssamMockGet(urlBill)?.state).toBe("D");

    payssamMockSetFault("timeout");
    expect(await rejection(p.createLink(linkInput("pay-2", { notify: true })))).toMatchObject({ kind: "unavailable" });
    await expect(p.createLink(linkInput("pay-2", { notify: true }))).resolves.toEqual({
      productKey: payssamBillId("", "pay-2", true),
      url: null,
    });
    expect(payssamMockGet(payssamBillId("", "pay-2", true))?.state).toBe("W");
    // 알림톡은 한 번만 나갔다
    expect(payssamMockPoints()).toBe(99);
  });

  it("점검 중 응답은 반영 여부를 알 수 없는 오류로 본다", async () => {
    payssamMockSetFault("maintenance");
    expect(await rejection(provider().createLink(linkInput("pay-1")))).toMatchObject({
      kind: "unavailable",
      code: "MAINTAINED_METHOD",
    });
  });

  it("조회 — 없는 청구서는 null, 결제되면 결제 완료", async () => {
    const p = provider();
    await expect(p.getOrder("nope")).resolves.toBeNull();
    const { productKey } = await p.createLink(linkInput("pay-1"));
    await expect(p.getOrder(productKey)).resolves.toMatchObject({ status: "NONE" });
    payssamMockPay(productKey);
    await expect(p.getOrder(productKey)).resolves.toMatchObject({
      orderKey: productKey,
      productKey,
      status: "DONE",
      amount: 690_000,
      method: "카드",
    });
    await expect(p.listRecentOrders()).resolves.toEqual([]);
  });

  it("파기 — 미결제 청구서를 닫고, 이미 없거나 닫힌 청구서는 성공으로 본다", async () => {
    const p = provider();
    const { productKey } = await p.createLink(linkInput("pay-1"));
    await p.deleteLink(productKey, { amount: 690_000 });
    expect(payssamMockGet(productKey)?.state).toBe("D");
    await expect(p.getOrder(productKey)).resolves.toMatchObject({ status: "FAILED", linkClosed: true });
    // 다시 파기 · 만든 적 없는 청구서 파기
    await expect(p.deleteLink(productKey, { amount: 690_000 })).resolves.toBeUndefined();
    await expect(p.deleteLink("never-created", { amount: 690_000 })).resolves.toBeUndefined();
  });

  it("결제된 청구서는 파기되지 않는다 (오류를 그대로 올린다)", async () => {
    const p = provider();
    const { productKey } = await p.createLink(linkInput("pay-1"));
    payssamMockPay(productKey);
    await expect(p.deleteLink(productKey, { amount: 690_000 })).rejects.toBeInstanceOf(ProviderError);
    expect(payssamMockGet(productKey)?.state).toBe("F");
  });

  it("재발송 — 알림톡이 한 번 더 나가고, 결제사에 청구서가 없으면 LINK_NOT_FOUND", async () => {
    const p = provider();
    const { productKey } = await p.createLink(linkInput("pay-1", { notify: true }));
    await p.resendLink?.(productKey);
    expect(payssamMockGet(productKey)?.talkCount).toBe(2);
    expect(payssamMockPoints()).toBe(98);
    expect(await rejection(p.resendLink?.("never-created") as Promise<void>)).toMatchObject({
      kind: "rejected",
      code: "LINK_NOT_FOUND",
    });
  });

  it("전액 취소 — 취소된 주문을 돌려주고, 다시 불러도 같은 결과", async () => {
    const p = provider();
    const { productKey } = await p.createLink(linkInput("pay-1"));
    payssamMockPay(productKey);

    const canceled = await p.cancelOrder({ orderKey: productKey, amount: 690_000, reason: "중도 퇴실로 인한 전액 환불 처리입니다", idempotencyKey: "k1" });
    expect(canceled.status).toBe("CANCELED");
    expect(canceled.cancels).toEqual([
      expect.objectContaining({ transactionKey: `payssam-cancel:${productKey}`, amount: 690_000 }),
    ]);
    expect(payssamMockGet(productKey)?.state).toBe("C");

    const again = await p.cancelOrder({ orderKey: productKey, amount: 690_000, reason: "재시도", idempotencyKey: "k1" });
    expect(again.status).toBe("CANCELED");
    expect(again.cancels[0].transactionKey).toBe(canceled.cancels[0].transactionKey);
  });

  it("취소 사유는 20자까지만 보낸다", async () => {
    const sent: Record<string, unknown>[] = [];
    const mock = createPayssamMockFetch(BASE);
    const p = createPayssamProvider(CONFIG, {
      fetch: (url, init) => {
        if (url.endsWith("/bill/cancel")) sent.push(JSON.parse(String(init.body)));
        return mock(url, init);
      },
    });
    const { productKey } = await p.createLink(linkInput("pay-1"));
    payssamMockPay(productKey);
    await p.cancelOrder({ orderKey: productKey, reason: "가".repeat(40), idempotencyKey: "k1" });
    expect(sent[0].bill).toEqual({
      billId: productKey,
      price: "690000",
      cancelReason: "가".repeat(20),
      hash: payssamHash([productKey, "690000"]),
    });
  });

  it("일부 금액 취소는 결제사를 부르지 않고 거절한다", async () => {
    const p = provider();
    const { productKey } = await p.createLink(linkInput("pay-1"));
    payssamMockPay(productKey);
    const error = await rejection(p.cancelOrder({ orderKey: productKey, amount: 100_000, reason: "일부", idempotencyKey: "k1" }));
    expect(error).toMatchObject({ kind: "rejected", code: "PARTIAL_CANCEL_UNSUPPORTED" });
    expect(payssamMockGet(productKey)?.state).toBe("F");
  });

  it("결제되지 않은 청구서·없는 청구서는 취소할 수 없다", async () => {
    const p = provider();
    const { productKey } = await p.createLink(linkInput("pay-1"));
    expect(await rejection(p.cancelOrder({ orderKey: productKey, reason: "r", idempotencyKey: "k" }))).toMatchObject({
      kind: "rejected",
      code: "NOT_PAID",
    });
    expect(await rejection(p.cancelOrder({ orderKey: "nope", reason: "r", idempotencyKey: "k" }))).toMatchObject({
      kind: "rejected",
      code: "BILL_003",
    });
  });

  it("취소 응답을 못 받았으면 알 수 없음 — 다시 부르면 취소된 것을 확인해 돌려준다", async () => {
    const p = provider();
    const { productKey } = await p.createLink(linkInput("pay-1"));
    payssamMockPay(productKey);

    // 조회는 정상, 취소 요청은 반영된 뒤 응답 없음
    payssamMockSetFault("timeout", "/bill/cancel");
    expect(await rejection(p.cancelOrder({ orderKey: productKey, amount: 690_000, reason: "r", idempotencyKey: "k" }))).toMatchObject({
      kind: "unavailable",
    });
    expect(payssamMockGet(productKey)?.state).toBe("C");
    await expect(p.cancelOrder({ orderKey: productKey, amount: 690_000, reason: "r", idempotencyKey: "k" })).resolves.toMatchObject({
      status: "CANCELED",
    });
  });

  it("매니저 사이트에서 직접 취소·파기한 것도 조회로 드러난다", async () => {
    const p = provider();
    const paid = await p.createLink(linkInput("pay-1"));
    payssamMockPay(paid.productKey);
    payssamMockManagerCancel(paid.productKey);
    await expect(p.getOrder(paid.productKey)).resolves.toMatchObject({
      status: "CANCELED",
      cancels: [expect.objectContaining({ amount: 690_000 })],
    });

    const open = await p.createLink(linkInput("pay-2"));
    payssamMockManagerDestroy(open.productKey);
    await expect(p.getOrder(open.productKey)).resolves.toMatchObject({ status: "FAILED", linkClosed: true });
  });

  it("쌤포인트 잔액과 충전 주소", async () => {
    payssamMockSetPoints(42);
    await expect(provider().getBalance?.()).resolves.toEqual({ balance: 42, chargeUrl: "https://manager.payssam.kr/" });
  });
});

describe("결제선생 어댑터 — 현금영수증", () => {
  const input = (key: string) => ({
    key,
    amount: 330_000,
    supplyAmount: 300_000,
    taxAmount: 30_000,
    purpose: "INCOME" as const,
    identifier: "01012345678",
    customerName: "김학생",
  });

  it("발급 번호는 접두어 + r + 임의 값, 20자 이내이고 매번 다르다", () => {
    const a = payssamCashReceiptKey("1234567890");
    expect(a).toMatch(/^1234567890r[0-9a-z]{9}$/);
    expect(payssamCashReceiptKey("1234567890")).not.toBe(a);
    expect(payssamCashReceiptKey("").length).toBeLessThanOrEqual(20);
  });

  it("발급 → 조회 → 취소 → 다시 취소(멱등) → 조회", async () => {
    const api = provider().cashReceipts!;
    const key = api.newKey();
    const { approvalNumber } = await api.issue(input(key));
    expect(payssamMockCashReceipt(key)).toMatchObject({ price: 330_000, supplyPrice: 300_000, tax: 30_000, trader: "0" });

    await expect(api.get(key, 330_000)).resolves.toEqual({
      status: "ISSUED",
      approvalNumber,
      amount: 330_000,
      supplyAmount: 300_000,
      taxAmount: 30_000,
      purpose: "INCOME",
      identifier: "01012345678",
    });
    await api.cancel(key, 330_000, "INCOME");
    await expect(api.cancel(key, 330_000, "INCOME")).resolves.toBeUndefined();
    await expect(api.get(key, 0)).resolves.toMatchObject({ status: "CANCELED", approvalNumber });
  });

  it("같은 번호로 다시 발급하면 DUPLICATE, 없는 번호 조회는 null", async () => {
    const api = provider().cashReceipts!;
    const key = api.newKey();
    await api.issue(input(key));
    await expect(api.issue(input(key))).rejects.toMatchObject({ kind: "rejected", code: "DUPLICATE" });
    await expect(api.get(api.newKey(), 1)).resolves.toBeNull();
  });

  it("공급가액+세액이 금액과 다르면 거절, 금액이 다른 취소도 거절", async () => {
    const api = provider().cashReceipts!;
    await expect(api.issue({ ...input(api.newKey()), taxAmount: 1 })).rejects.toMatchObject({
      kind: "rejected",
      code: "PAYMENT_001",
    });
    const key = api.newKey();
    await api.issue(input(key));
    await expect(api.cancel(key, 300_000, "INCOME")).rejects.toMatchObject({ kind: "rejected", code: "BILL_003" });
  });

  it("발급 응답을 못 받으면 알 수 없음 — 조회하면 발급된 것이 보인다", async () => {
    const api = provider().cashReceipts!;
    const key = api.newKey();
    payssamMockSetFault("timeout", "/cash-receipt/issue");
    await expect(api.issue(input(key))).rejects.toMatchObject({ kind: "unavailable" });
    await expect(api.get(key, 330_000)).resolves.toMatchObject({ status: "ISSUED" });
  });

  it("조회 이력 해석 — 발급 기록이 없으면 null, 구분은 숫자·글자 둘 다 읽는다", () => {
    expect(mapPayssamCashReceipt([])).toBeNull();
    expect(mapPayssamCashReceipt([{ apprState: "F", trader: "지출증빙", apprNum: "1", apprPrice: "1000" }])).toMatchObject({
      status: "ISSUED",
      purpose: "EXPENSE",
      amount: 1000,
    });
  });
});

describe("결제선생 클라이언트 — 응답 해석", () => {
  const respond = (status: number, body: unknown) =>
    createPayssamClient(CONFIG, {
      fetch: async () => (body === undefined ? new Response("<html>502</html>", { status }) : Response.json(body, { status })),
    });

  it("code 0000 만 성공. v1 형식(msg, data 없음)도 읽는다", async () => {
    await expect(respond(200, { code: "0000", msg: "성공하였습니다.", data: { shortUrl: "https://pay/1" } }).sendBill({
      billId: "b", sendType: "URL", productName: "p", price: 20_000, memberName: "m", phone: "01012345678", callbackUrl: "https://cb",
    })).resolves.toEqual({ shortUrl: "https://pay/1" });
  });

  it("업무 오류 코드는 HTTP 상태와 상관없이 거절로 본다", async () => {
    for (const status of [200, 400]) {
      const error = await rejection(respond(status, { code: "VALIDATION_002", message: "해싱값을 확인하시기 바랍니다." }).resendBill("b"));
      expect(error).toMatchObject({ kind: "rejected", code: "VALIDATION_002" });
    }
  });

  it("5xx · 읽을 수 없는 응답 · 미분류 서버 오류는 반영 여부를 알 수 없다", async () => {
    expect(await rejection(respond(500, { code: "ERROR", message: "처리 중 오류" }).resendBill("b"))).toMatchObject({ kind: "unavailable" });
    expect(await rejection(respond(502, undefined).resendBill("b"))).toMatchObject({ kind: "unavailable" });
    expect(await rejection(respond(200, { code: "ERROR", message: "처리 중 오류가 발생하였습니다." }).resendBill("b"))).toMatchObject({
      kind: "unavailable",
      code: "ERROR",
    });
    expect(await rejection(respond(200, {}).resendBill("b"))).toMatchObject({ kind: "unavailable" });
  });

  it("연결 실패는 알 수 없음, 조회는 한 번 더 시도한다", async () => {
    let calls = 0;
    const client = createPayssamClient(CONFIG, {
      fetch: async () => {
        calls += 1;
        if (calls === 1) throw new Error("ECONNRESET");
        return Response.json({ code: "0000", message: "성공", data: { apprState: "W" } });
      },
    });
    await expect(client.readBill("b")).resolves.toEqual({ apprState: "W" });
    expect(calls).toBe(2);

    const down = createPayssamClient(CONFIG, { fetch: async () => { throw new Error("ECONNREFUSED"); } });
    expect(await rejection(down.resendBill("b"))).toMatchObject({ kind: "unavailable" });
  });

  it("충전 주소는 https 만 통과시킨다", async () => {
    await expect(respond(200, { code: "0000", data: { balance: 3, chargeUrl: "javascript:alert(1)" } }).remainCount()).resolves.toEqual({
      balance: 3,
      chargeUrl: null,
    });
  });
});

describe("결제사 선택", () => {
  beforeEach(() => {
    for (const key of ["TUITION_PROVIDER", "TOSS_SECRET_KEY", "PAYSSAM_API_KEY", "PAYSSAM_MEMBER", "PAYSSAM_MERCHANT", "PAYSSAM_BASE_URL", "PAYSSAM_TALK"]) {
      vi.stubEnv(key, "");
    }
    vi.stubEnv("NODE_ENV", "development");
  });

  const payssamKeys = () => {
    vi.stubEnv("PAYSSAM_API_KEY", "k");
    vi.stubEnv("PAYSSAM_MEMBER", "m");
    vi.stubEnv("PAYSSAM_MERCHANT", "s");
  };

  it("결제선생 키가 있으면 결제선생, 토스 키도 있으면 결제선생이 먼저", () => {
    payssamKeys();
    expect(getTuitionProvider()?.name).toBe("payssam");
    vi.stubEnv("TOSS_SECRET_KEY", "test_sk_abc");
    expect(getTuitionProvider()?.name).toBe("payssam");
  });

  it("TUITION_PROVIDER 로 정해 두면 그 결제사만 — 키가 없으면 온라인 결제 미사용", () => {
    payssamKeys();
    vi.stubEnv("TOSS_SECRET_KEY", "test_sk_abc");
    vi.stubEnv("TUITION_PROVIDER", "toss");
    expect(getTuitionProvider()?.name).toBe("toss");
    vi.stubEnv("TOSS_SECRET_KEY", "");
    expect(getTuitionProvider()).toBeNull();
    vi.stubEnv("TUITION_PROVIDER", "payssam");
    expect(getTuitionProvider()?.name).toBe("payssam");
  });

  it("모의 결제선생은 개발에서만 (PAYSSAM_BASE_URL=mock)", () => {
    vi.stubEnv("PAYSSAM_BASE_URL", "mock");
    expect(isPayssamMockEnabled()).toBe(true);
    expect(getTuitionProvider()).toMatchObject({ name: "payssam", testMode: true });

    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(isPayssamMockEnabled()).toBe(false);
    expect(getTuitionProvider()).toBeNull();
  });

  it("운영에서 주소 없이 키만 있으면 결제선생을 켜지 않는다", () => {
    payssamKeys();
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(getTuitionProvider()).toBeNull();
    vi.stubEnv("PAYSSAM_BASE_URL", "https://live.example.com/partner");
    expect(getTuitionProvider()).toMatchObject({ name: "payssam", testMode: false });
  });
});
