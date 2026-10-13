import { beforeEach, describe, expect, it, vi } from "vitest";

// 현금영수증 기록 — 대상 수납 확인, 금액 스냅샷, 상태 전이 조건.
// 트랜잭션은 흉내 낸 tx 로 돌린다 (실제 락·동시성은 scripts/smoke-tuition.ts 가 개발 DB 로 본다).

const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  tuitionPayment: { findUnique: vi.fn() },
  tuitionCashReceipt: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  tuitionEvent: { create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    tuitionPayment: { findUnique: vi.fn() },
    tuitionCashReceipt: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { cancelCashReceipt, markCashReceiptIssued, requestCashReceipt } from "@/lib/tuition/cash-receipt";

const actor = { id: "user-1", name: "직원" };

function txPayment(overrides: Record<string, unknown> = {}) {
  return {
    method: "CASH",
    status: "DONE",
    paidAmount: 330_000,
    refundedAmount: 0,
    isDuplicate: false,
    invoice: { taxType: "EXEMPT" },
    cashReceipt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.tuitionPayment.findUnique).mockResolvedValue({
    invoiceId: "inv-1",
    invoice: { studentId: "student-1" },
  } as never);
  vi.mocked(prisma.tuitionCashReceipt.findUnique).mockResolvedValue({
    invoiceId: "inv-1",
    paymentId: "pay-1",
    amount: 330_000,
    invoice: { studentId: "student-1" },
  } as never);
  tx.tuitionPayment.findUnique.mockResolvedValue(txPayment());
  tx.tuitionCashReceipt.create.mockResolvedValue({ id: "receipt-1" });
  tx.tuitionCashReceipt.update.mockResolvedValue({ id: "receipt-1" });
  tx.tuitionCashReceipt.updateMany.mockResolvedValue({ count: 1 });
});

describe("requestCashReceipt", () => {
  const input = { paymentId: "pay-1", purpose: "INCOME" as const, identifier: "010-1234-5678" };

  it("구분·번호가 틀리면 DB 에 닿기 전에 거절한다", async () => {
    await expect(requestCashReceipt({ ...input, purpose: "GIFT" as never }, actor)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(requestCashReceipt({ ...input, identifier: "900101-1234567" }, actor)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(prisma.tuitionPayment.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("없는 결제면 NOT_FOUND", async () => {
    vi.mocked(prisma.tuitionPayment.findUnique).mockResolvedValue(null);
    await expect(requestCashReceipt(input, actor)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("학생 단위 락을 잡고, 남은 수납액으로 신청을 만든다", async () => {
    tx.tuitionPayment.findUnique.mockResolvedValue(txPayment({ refundedAmount: 30_000 }));

    await expect(requestCashReceipt(input, actor)).resolves.toEqual({ cashReceiptId: "receipt-1" });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.tuitionCashReceipt.create.mock.calls[0][0].data).toMatchObject({
      invoiceId: "inv-1",
      paymentId: "pay-1",
      purpose: "INCOME",
      identifier: "01012345678",
      amount: 300_000,
      supplyAmount: 300_000,
      taxAmount: 0,
      status: "REQUESTED",
      requestedById: "user-1",
      requestedByName: "직원",
    });
    expect(tx.tuitionEvent.create.mock.calls[0][0].data).toMatchObject({
      type: "CASH_RECEIPT_REQUESTED",
      invoiceId: "inv-1",
      paymentId: "pay-1",
    });
    // 진행 기록에는 번호를 남기지 않는다
    expect(tx.tuitionEvent.create.mock.calls[0][0].data.detail).not.toContain("0101234");
  });

  it("과세 청구서면 공급가액·세액을 나눠 남긴다", async () => {
    tx.tuitionPayment.findUnique.mockResolvedValue(txPayment({ invoice: { taxType: "TAXABLE" } }));
    await requestCashReceipt({ ...input, purpose: "EXPENSE", identifier: "123-45-67890" }, actor);
    expect(tx.tuitionCashReceipt.create.mock.calls[0][0].data).toMatchObject({
      purpose: "EXPENSE",
      identifier: "1234567890",
      amount: 330_000,
      supplyAmount: 300_000,
      taxAmount: 30_000,
    });
  });

  it.each([
    ["카드 결제", { method: "ONSITE_CARD" }],
    ["지역화폐", { method: "LOCAL_CURRENCY" }],
    ["온라인 결제", { method: "LINK" }],
    ["아직 확인되지 않은 수납", { status: "ONSITE_REQUESTED" }],
    ["중복 결제", { isDuplicate: true }],
    ["전액 환불된 수납", { refundedAmount: 330_000 }],
  ])("%s 에는 등록하지 않는다", async (_label, patch) => {
    tx.tuitionPayment.findUnique.mockResolvedValue(txPayment(patch));
    await expect(requestCashReceipt(input, actor)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(tx.tuitionCashReceipt.create).not.toHaveBeenCalled();
    expect(tx.tuitionCashReceipt.update).not.toHaveBeenCalled();
  });

  it("신청·취소 상태의 기존 건은 내용을 고쳐 발급 필요로 되돌린다", async () => {
    tx.tuitionPayment.findUnique.mockResolvedValue(txPayment({ cashReceipt: { id: "receipt-1", status: "CANCELED" } }));
    await requestCashReceipt(input, actor);
    expect(tx.tuitionCashReceipt.create).not.toHaveBeenCalled();
    const update = tx.tuitionCashReceipt.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: "receipt-1" });
    expect(update.data).toMatchObject({
      status: "REQUESTED",
      identifier: "01012345678",
      approvalNumber: null,
      issuedAt: null,
      canceledAt: null,
      cancelReason: null,
    });
  });

  it("발급 완료된 건은 고칠 수 없다", async () => {
    tx.tuitionPayment.findUnique.mockResolvedValue(txPayment({ cashReceipt: { id: "receipt-1", status: "ISSUED" } }));
    await expect(requestCashReceipt(input, actor)).rejects.toMatchObject({ code: "INVALID_INPUT", httpStatus: 409 });
    expect(tx.tuitionCashReceipt.update).not.toHaveBeenCalled();
  });
});

describe("markCashReceiptIssued", () => {
  it("승인번호 형식이 틀리면 거절한다", async () => {
    for (const bad of ["", "  ", "abc", "승인번호1234", "a".repeat(31)]) {
      await expect(markCashReceiptIssued("receipt-1", bad, actor)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("발급 필요 상태일 때만 발급 완료로 바꾸고, 금액은 지금 남은 수납액으로 다시 맞춘다", async () => {
    // 신청 뒤 3만원 환불됨
    tx.tuitionPayment.findUnique.mockResolvedValue({
      paidAmount: 330_000,
      refundedAmount: 30_000,
      invoice: { taxType: "EXEMPT" },
    });

    await markCashReceiptIssued("receipt-1", " A12345678 ", actor);

    const update = tx.tuitionCashReceipt.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({ id: "receipt-1", status: "REQUESTED" });
    expect(update.data).toMatchObject({
      status: "ISSUED",
      amount: 300_000,
      supplyAmount: 300_000,
      taxAmount: 0,
      approvalNumber: "A12345678",
      issuedById: "user-1",
    });
    expect(tx.tuitionEvent.create.mock.calls[0][0].data.type).toBe("CASH_RECEIPT_ISSUED");
  });

  it("전액 환불된 수납은 발급 완료로 바꾸지 않는다", async () => {
    tx.tuitionPayment.findUnique.mockResolvedValue({
      paidAmount: 330_000,
      refundedAmount: 330_000,
      invoice: { taxType: "EXEMPT" },
    });
    await expect(markCashReceiptIssued("receipt-1", "A12345678", actor)).rejects.toMatchObject({ httpStatus: 409 });
    expect(tx.tuitionCashReceipt.updateMany).not.toHaveBeenCalled();
  });

  it("이미 발급·취소된 건이면 거절하고 기록을 남기지 않는다", async () => {
    tx.tuitionCashReceipt.updateMany.mockResolvedValue({ count: 0 });
    await expect(markCashReceiptIssued("receipt-1", "A12345678", actor)).rejects.toMatchObject({ httpStatus: 409 });
    expect(tx.tuitionEvent.create).not.toHaveBeenCalled();
  });

  it("없는 현금영수증이면 NOT_FOUND", async () => {
    vi.mocked(prisma.tuitionCashReceipt.findUnique).mockResolvedValue(null);
    await expect(markCashReceiptIssued("receipt-x", "A12345678", actor)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("cancelCashReceipt", () => {
  it("사유가 있어야 한다", async () => {
    await expect(cancelCashReceipt("receipt-1", "   ", actor)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("발급 필요·발급 완료 상태만 취소로 바꾼다", async () => {
    await cancelCashReceipt("receipt-1", " 환불로 재발급 ", actor);
    const update = tx.tuitionCashReceipt.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({ id: "receipt-1", status: { in: ["REQUESTED", "ISSUED"] } });
    expect(update.data).toMatchObject({ status: "CANCELED", cancelReason: "환불로 재발급", canceledById: "user-1" });
    expect(tx.tuitionEvent.create.mock.calls[0][0].data.type).toBe("CASH_RECEIPT_CANCELED");
  });

  it("이미 취소된 건이면 거절한다", async () => {
    tx.tuitionCashReceipt.updateMany.mockResolvedValue({ count: 0 });
    await expect(cancelCashReceipt("receipt-1", "중복", actor)).rejects.toMatchObject({ httpStatus: 409 });
    expect(tx.tuitionEvent.create).not.toHaveBeenCalled();
  });
});
