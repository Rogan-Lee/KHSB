import { beforeEach, describe, expect, it, vi } from "vitest";

// 코어의 입력 검증·진입 조건·오류 변환을 확인한다 (DB 에 닿기 전에 결정되는 부분).
// 상태 전이·경합은 실제 트랜잭션이 필요해 scripts/smoke-tuition.ts 가 개발 DB 로 검증한다.

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    tuitionInvoice: { findUnique: vi.fn() },
    tuitionPayment: { findUnique: vi.fn(), findFirst: vi.fn() },
    tuitionSetting: { findUnique: vi.fn() },
    tuitionEvent: { create: vi.fn() },
  },
}));
vi.mock("@/lib/tuition/provider-registry", () => ({
  getTuitionProvider: vi.fn(),
  isMockProviderEnabled: vi.fn(() => false),
}));
vi.mock("@/lib/tuition/effects", () => ({
  dispatchTuitionEffects: vi.fn(),
  runTuitionEffects: vi.fn(),
}));
vi.mock("@/lib/mobile-push", () => ({
  notifyParentsOfStudent: vi.fn(),
  PARENT_PUSH_ROUTES: { tuition: "/(parent)/tuition" },
}));
vi.mock("@/lib/slack", () => ({ notifySlack: vi.fn() }));

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { issueInvoice } from "@/lib/tuition/invoice";
import { sendInvoiceTalk, startCheckout } from "@/lib/tuition/payment";
import { ProviderError, type TuitionProvider } from "@/lib/tuition/provider";
import { getTuitionProvider } from "@/lib/tuition/provider-registry";
import { refundMethodFor, requestRefund } from "@/lib/tuition/refund";
import { runTuition } from "@/lib/tuition/run";
import { handleProviderWebhook } from "@/lib/tuition/settle";
import { TuitionError } from "@/lib/tuition/types";

const actor = { id: "user-1", name: "원장" };

function fakeProvider(patch: Partial<TuitionProvider> = {}): TuitionProvider {
  return {
    name: "mock",
    partialCancel: true,
    linkIsOrder: false,
    canNotify: false,
    testMode: true,
    createLink: vi.fn(),
    deleteLink: vi.fn(),
    getOrder: vi.fn(),
    listRecentOrders: vi.fn(),
    cancelOrder: vi.fn(),
    ...patch,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("issueInvoice — 입력 검증", () => {
  const valid = { studentId: "s1", periodStart: "2026-11-01", months: 1, monthlyFee: 690_000, dueDate: "2026-11-05" };

  it.each([
    [{ periodStart: "2026-02-30" }, "이용 시작일"],
    [{ dueDate: "11/05" }, "납부 기한"],
    [{ months: 0 }, "개월 수"],
    [{ months: 13 }, "개월 수"],
    [{ monthlyFee: 0 }, "월 수강료"],
    [{ discount: 690_000 }, "청구 금액"],
  ])("잘못된 입력 %o 은 DB 에 닿기 전에 거절", async (patch, message) => {
    await expect(issueInvoice({ ...valid, ...patch }, actor)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: expect.stringContaining(message),
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("startCheckout — 온라인 결제 사용 여부", () => {
  const input = { invoiceId: "inv-1", studentId: "s1", authUserId: "parent-1" };

  it("결제사 키가 없으면 ONLINE_DISABLED", async () => {
    vi.mocked(getTuitionProvider).mockReturnValue(null);
    await expect(startCheckout(input)).rejects.toMatchObject({ code: "ONLINE_DISABLED" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("설정에서 온라인 결제를 껐으면 키가 있어도 ONLINE_DISABLED", async () => {
    vi.mocked(getTuitionProvider).mockReturnValue(fakeProvider());
    vi.mocked(prisma.tuitionSetting.findUnique).mockResolvedValue({ onlinePaymentEnabled: false } as never);
    await expect(startCheckout(input)).rejects.toMatchObject({ code: "ONLINE_DISABLED" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("다른 자녀의 청구서면 NOT_FOUND — 결제 링크를 만들지 않는다", async () => {
    const provider = fakeProvider();
    vi.mocked(getTuitionProvider).mockReturnValue(provider);
    vi.mocked(prisma.tuitionSetting.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.tuitionInvoice.findUnique).mockResolvedValue({ studentId: "other-child" } as never);
    await expect(startCheckout(input)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(provider.createLink).not.toHaveBeenCalled();
  });
});

describe("requestRefund — 입력 검증", () => {
  it.each([
    [{ amount: 0 }, "환불 금액"],
    [{ amount: 1000.5 }, "환불 금액"],
    [{ reason: "   " }, "환불 사유"],
    [{ lastUsedDate: "2026-13-01" }, "마지막 이용일"],
  ])("잘못된 입력 %o 은 거절", async (patch, message) => {
    await expect(
      requestRefund({ invoiceId: "inv-1", amount: 10_000, reason: "퇴원", ...patch }, actor),
    ).rejects.toMatchObject({ code: "INVALID_INPUT", message: expect.stringContaining(message) });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("handleProviderWebhook", () => {
  it("결제사 연동이 없으면 무시", async () => {
    vi.mocked(getTuitionProvider).mockReturnValue(null);
    expect(await handleProviderWebhook("ord_1")).toEqual({ outcome: "IGNORED" });
  });

  it("결제사에 없는 주문이면 무시 — 본문만 믿고 반영하지 않는다", async () => {
    const provider = fakeProvider({ getOrder: vi.fn().mockResolvedValue(null) });
    vi.mocked(getTuitionProvider).mockReturnValue(provider);
    expect(await handleProviderWebhook("ord_forged")).toEqual({ outcome: "IGNORED" });
    expect(provider.getOrder).toHaveBeenCalledWith("ord_forged");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("결제사 조회가 실패하면 그대로 던진다 — 웹훅이 500 을 돌려줘 다시 받게 된다", async () => {
    const provider = fakeProvider({
      getOrder: vi.fn().mockRejectedValue(new ProviderError("결제사에 연결하지 못했습니다", "unavailable")),
    });
    vi.mocked(getTuitionProvider).mockReturnValue(provider);
    await expect(handleProviderWebhook("ord_1")).rejects.toBeInstanceOf(ProviderError);
  });

  it("청구서와 이어지지 않는 결제는 UNMATCHED — 반영하지 않고 기록만 남긴다", async () => {
    const provider = fakeProvider({
      getOrder: vi.fn().mockResolvedValue({
        orderKey: "ord_other",
        productKey: "prod_other",
        metaPaymentId: null,
        amount: 5000,
        status: "DONE",
        paymentKey: "pk",
        method: "카드",
        approvedAt: new Date(),
        receiptUrl: null,
        cancels: [],
        virtualAccount: null,
      }),
    });
    vi.mocked(getTuitionProvider).mockReturnValue(provider);
    vi.mocked(prisma.tuitionPayment.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.tuitionPayment.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.tuitionEvent.create).mockResolvedValue({} as never);

    expect(await handleProviderWebhook("ord_other")).toEqual({ outcome: "UNMATCHED" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.tuitionEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "WEBHOOK_UNMATCHED" }) }),
    );
  });
});

describe("runTuition — 서버 액션용 결과 변환", () => {
  it("업무 오류는 코드와 문구를 그대로 돌려준다", async () => {
    const result = await runTuition(async () => {
      throw new TuitionError("ALREADY_PAID", "이미 납부된 수강료예요", 409);
    });
    expect(result).toEqual({ ok: false, code: "ALREADY_PAID", error: "이미 납부된 수강료예요" });
  });

  it("락 대기 시간 초과는 BUSY", async () => {
    const result = await runTuition(async () => {
      throw new Prisma.PrismaClientKnownRequestError("timeout", { code: "P2028", clientVersion: "test" });
    });
    expect(result).toMatchObject({ ok: false, code: "BUSY" });
  });

  it("예상하지 못한 오류는 내부 문구를 숨기고 INTERNAL", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await runTuition(async () => {
      throw new Error("relation \"X\" does not exist");
    });
    expect(result).toEqual({ ok: false, code: "INTERNAL", error: "처리하지 못했습니다. 잠시 후 다시 시도해 주세요" });
    spy.mockRestore();
  });

  it("성공하면 data 로 감싼다", async () => {
    expect(await runTuition(async () => ({ invoiceId: "inv-1" }))).toEqual({ ok: true, data: { invoiceId: "inv-1" } });
  });
});

describe("전액 취소만 되는 결제사 — 환불 방식", () => {
  const link = { method: "LINK", paidAmount: 690_000, refundedAmount: 0 };

  it("부분 취소가 되는 결제사(또는 연동 없음)는 온라인 결제를 항상 결제사로 환불한다", () => {
    vi.mocked(getTuitionProvider).mockReturnValue(fakeProvider({ partialCancel: true }));
    expect(refundMethodFor(link, 100_000)).toBe("PROVIDER");
    vi.mocked(getTuitionProvider).mockReturnValue(null);
    expect(refundMethodFor(link, 100_000)).toBe("PROVIDER");
  });

  it("전액 취소만 되면 — 한 번도 환불하지 않은 결제의 전액만 결제사로, 나머지는 직접 환불", () => {
    vi.mocked(getTuitionProvider).mockReturnValue(fakeProvider({ partialCancel: false }));
    expect(refundMethodFor(link, 690_000)).toBe("PROVIDER");
    expect(refundMethodFor(link, 689_990)).toBe("MANUAL");
    // 이미 일부를 돌려준 결제는 남은 전부를 환불해도 직접 환불 (결제사는 원래 금액 전체를 취소한다)
    expect(refundMethodFor({ ...link, refundedAmount: 100_000 }, 590_000)).toBe("MANUAL");
  });

  it("현장 결제는 결제사와 상관없이 직접 환불", () => {
    vi.mocked(getTuitionProvider).mockReturnValue(fakeProvider({ partialCancel: true }));
    expect(refundMethodFor({ method: "CASH", paidAmount: 690_000, refundedAmount: 0 }, 690_000)).toBe("MANUAL");
  });
});

describe("sendInvoiceTalk — 보낼 수 있는 설정인지", () => {
  const input = { invoiceId: "inv-1" };

  it("알림톡을 보낼 수 없는 결제사·연동 없음이면 PROVIDER_UNAVAILABLE", async () => {
    vi.mocked(getTuitionProvider).mockReturnValue(null);
    await expect(sendInvoiceTalk(input, actor)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    vi.mocked(getTuitionProvider).mockReturnValue(fakeProvider({ canNotify: false }));
    await expect(sendInvoiceTalk(input, actor)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("온라인 결제를 꺼 두었으면 ONLINE_DISABLED — 결제사를 부르지 않는다", async () => {
    const provider = fakeProvider({ canNotify: true, linkKeyFor: vi.fn(() => "t123") });
    vi.mocked(getTuitionProvider).mockReturnValue(provider);
    vi.mocked(prisma.tuitionSetting.findUnique).mockResolvedValue({ onlinePaymentEnabled: false } as never);
    await expect(sendInvoiceTalk(input, actor)).rejects.toMatchObject({ code: "ONLINE_DISABLED" });
    expect(provider.createLink).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
