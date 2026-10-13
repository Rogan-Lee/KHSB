import { beforeEach, describe, expect, it, vi } from "vitest";

// 청구서 링크 액션은 로그인이 없다 — 주소의 토큰이 인증이다.
// "토큰으로 찾은 청구서에만 동작하는지"와 "횟수 제한이 먼저 걸리는지"를 고정해 둔다.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ host: "localhost:3100" })) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tuitionInvoice: { findUnique: vi.fn() },
    tuitionPayment: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/utils", () => ({ todayKST: () => new Date("2026-10-10T00:00:00.000Z") }));
vi.mock("@/lib/tuition/core", () => ({
  CHECKOUT_DAILY_LIMIT: 20,
  ONSITE_DAILY_LIMIT: 10,
  assertTuitionDailyAttempts: vi.fn(),
  findInvoiceByToken: vi.fn(),
  requestOnsitePayment: vi.fn(),
  startCheckout: vi.fn(),
  syncInvoice: vi.fn(),
  withdrawOnsiteRequest: vi.fn(),
}));

import { requestBillOnsite, startBillCheckout, syncBill, withdrawBillOnsite } from "@/actions/tuition-bill";
import { prisma } from "@/lib/prisma";
import {
  assertTuitionDailyAttempts,
  findInvoiceByToken,
  requestOnsitePayment,
  startCheckout,
  syncInvoice,
  withdrawOnsiteRequest,
} from "@/lib/tuition/core";
import { TuitionError } from "@/lib/tuition/types";

const TOKEN = "tok_abcdefghijklmnopqrstuvwxyz012345";
const INVOICE = { id: "inv-1", studentId: "student-1" };

const ACTIONS: Record<string, (token: string) => Promise<{ ok: boolean }>> = {
  startBillCheckout: (token) => startBillCheckout(token),
  requestBillOnsite: (token) => requestBillOnsite(token, "LOCAL_CURRENCY"),
  withdrawBillOnsite: (token) => withdrawBillOnsite(token),
  syncBill: (token) => syncBill(token),
};

function expectCoreUntouched() {
  for (const mock of [assertTuitionDailyAttempts, requestOnsitePayment, startCheckout, syncInvoice, withdrawOnsiteRequest]) {
    expect(mock).not.toHaveBeenCalled();
  }
  expect(prisma.tuitionPayment.findFirst).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.mocked(findInvoiceByToken).mockResolvedValue(INVOICE);
  vi.mocked(assertTuitionDailyAttempts).mockResolvedValue(undefined);
  vi.mocked(startCheckout).mockResolvedValue({
    paymentId: "pay-1",
    payUrl: "https://pay.example.com/link/abc",
    expiresAt: "2026-10-17T00:00:00.000Z",
  });
  vi.mocked(requestOnsitePayment).mockResolvedValue({ paymentId: "pay-2" });
  vi.mocked(withdrawOnsiteRequest).mockResolvedValue(undefined);
  vi.mocked(syncInvoice).mockResolvedValue({ status: "PAID", changed: true });
  vi.mocked(prisma.tuitionPayment.findFirst).mockResolvedValue({ id: "pay-2" } as never);
  vi.mocked(prisma.tuitionInvoice.findUnique).mockResolvedValue({ dueDate: new Date("2026-10-05T00:00:00.000Z") } as never);
});

describe("토큰", () => {
  it.each(Object.keys(ACTIONS))("%s — 없는 토큰이면 아무 것도 하지 않고 NOT_FOUND", async (name) => {
    vi.mocked(findInvoiceByToken).mockResolvedValue(null);
    await expect(ACTIONS[name](TOKEN)).resolves.toMatchObject({ ok: false, code: "NOT_FOUND" });
    expectCoreUntouched();
  });

  it.each(Object.keys(ACTIONS))("%s — 문자열이 아닌 토큰은 조회조차 하지 않는다", async (name) => {
    await expect(ACTIONS[name]({ $ne: null } as never)).resolves.toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(findInvoiceByToken).not.toHaveBeenCalled();
    expectCoreUntouched();
  });
});

describe("startBillCheckout", () => {
  it("토큰의 청구서로만 결제 링크를 만들고 주소만 돌려준다", async () => {
    await expect(startBillCheckout(TOKEN)).resolves.toEqual({
      ok: true,
      data: { payUrl: "https://pay.example.com/link/abc" },
    });
    expect(assertTuitionDailyAttempts).toHaveBeenCalledWith("student-1", ["LINK"], 20, expect.any(String));
    expect(startCheckout).toHaveBeenCalledWith({
      invoiceId: "inv-1",
      studentId: "student-1",
      authUserId: null,
      baseUrl: "http://localhost:3100",
    });
  });

  it("운영에서는 접속한 Host 로 주소를 만들지 않는다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await startBillCheckout(TOKEN);
    expect(vi.mocked(startCheckout).mock.calls[0][0].baseUrl).toBeUndefined();
  });

  it("횟수 제한에 걸리면 결제 링크를 만들지 않는다", async () => {
    vi.mocked(assertTuitionDailyAttempts).mockRejectedValue(new TuitionError("BUSY", "결제 시도가 너무 많아요", 429));
    await expect(startBillCheckout(TOKEN)).resolves.toEqual({ ok: false, code: "BUSY", error: "결제 시도가 너무 많아요" });
    expect(startCheckout).not.toHaveBeenCalled();
  });

  it("코어의 업무 오류를 그대로 돌려준다", async () => {
    vi.mocked(startCheckout).mockRejectedValue(new TuitionError("ALREADY_PAID", "이미 납부된 청구서입니다", 409));
    await expect(startBillCheckout(TOKEN)).resolves.toEqual({
      ok: false,
      code: "ALREADY_PAID",
      error: "이미 납부된 청구서입니다",
    });
  });
});

describe("현장 결제 신청 · 철회", () => {
  it("지역화폐·현장 카드만 신청할 수 있다", async () => {
    await expect(requestBillOnsite(TOKEN, "ONSITE_CARD")).resolves.toMatchObject({ ok: true });
    expect(requestOnsitePayment).toHaveBeenCalledWith({
      invoiceId: "inv-1",
      studentId: "student-1",
      authUserId: null,
      method: "ONSITE_CARD",
    });

    vi.mocked(requestOnsitePayment).mockClear();
    for (const method of ["CASH", "TRANSFER", "LINK", undefined]) {
      await expect(requestBillOnsite(TOKEN, method as never)).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    }
    expect(requestOnsitePayment).not.toHaveBeenCalled();
  });

  it("횟수 제한에 걸리면 신청하지 않는다", async () => {
    vi.mocked(assertTuitionDailyAttempts).mockRejectedValue(new TuitionError("BUSY", "오늘은 더 신청할 수 없어요", 429));
    await expect(requestBillOnsite(TOKEN, "LOCAL_CURRENCY")).resolves.toMatchObject({ ok: false, code: "BUSY" });
    expect(requestOnsitePayment).not.toHaveBeenCalled();
  });

  it("철회는 이 청구서에 걸린 신청만 찾는다 (결제 id 를 바깥에서 받지 않는다)", async () => {
    await expect(withdrawBillOnsite(TOKEN)).resolves.toMatchObject({ ok: true });
    expect(vi.mocked(prisma.tuitionPayment.findFirst).mock.calls[0][0]?.where).toEqual({
      invoiceId: "inv-1",
      status: "ONSITE_REQUESTED",
    });
    expect(withdrawOnsiteRequest).toHaveBeenCalledWith({ paymentId: "pay-2", studentId: "student-1", authUserId: null });
  });

  it("걸린 신청이 없으면 조용히 끝난다", async () => {
    vi.mocked(prisma.tuitionPayment.findFirst).mockResolvedValue(null);
    await expect(withdrawBillOnsite(TOKEN)).resolves.toMatchObject({ ok: true });
    expect(withdrawOnsiteRequest).not.toHaveBeenCalled();
  });
});

describe("syncBill", () => {
  it("결제사에 다시 물어 납부 여부를 돌려준다", async () => {
    await expect(syncBill(TOKEN)).resolves.toEqual({ ok: true, data: { status: "PAID", paid: true } });
    expect(syncInvoice).toHaveBeenCalledWith("inv-1", "SYNC");
  });

  it("아직 결제 전이면 기한에 따라 결제 요청·미납으로 알려 준다", async () => {
    vi.mocked(syncInvoice).mockResolvedValue({ status: "REQUESTED", changed: false });
    await expect(syncBill(TOKEN)).resolves.toEqual({ ok: true, data: { status: "OVERDUE", paid: false } });
  });
});
