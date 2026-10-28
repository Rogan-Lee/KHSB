import { beforeEach, describe, expect, it, vi } from "vitest";

// 현금영수증 기록 — 대상 수납 확인, 금액 스냅샷, 상태 전이 조건.
// 트랜잭션은 흉내 낸 tx 로 돌린다 (실제 락·동시성은 scripts/smoke-tuition.ts 가 개발 DB 로 본다).

const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  tuitionPayment: { findUnique: vi.fn() },
  tuitionCashReceipt: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
  tuitionEvent: { create: vi.fn() },
}));

// 결제사(결제선생) 현금영수증 API
const api = vi.hoisted(() => ({ newKey: vi.fn(), issue: vi.fn(), cancel: vi.fn(), get: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    tuitionPayment: { findUnique: vi.fn() },
    tuitionCashReceipt: { findUnique: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock("@/lib/tuition/provider-registry", () => ({ getTuitionProvider: () => ({ cashReceipts: api }) }));

import { prisma } from "@/lib/prisma";
import {
  cancelCashReceipt,
  issueCashReceiptWithProvider,
  markCashReceiptIssued,
  requestCashReceipt,
} from "@/lib/tuition/cash-receipt";
import { ProviderError } from "@/lib/tuition/provider";

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
    // 취소된 건의 결제선생 번호는 다시 쓸 수 없다 — 비운다
    expect(update.data.providerBillId).toBeNull();
  });

  it("결제선생 발급 결과를 모르는 신청은 고쳐도 번호를 남긴다 (다음 발급이 그 번호로 결과를 확인한다)", async () => {
    tx.tuitionPayment.findUnique.mockResolvedValue(
      txPayment({ cashReceipt: { id: "receipt-1", status: "REQUESTED", providerBillId: "rOLD" } }),
    );
    await requestCashReceipt(input, actor);
    expect(tx.tuitionCashReceipt.update.mock.calls[0][0].data).not.toHaveProperty("providerBillId");
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
    expect(update.where).toEqual({ id: "receipt-1", status: "REQUESTED", providerBillId: null });
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

describe("결제선생으로 발급·취소", () => {
  function storedReceipt(overrides: Record<string, unknown> = {}) {
    return {
      invoiceId: "inv-1",
      paymentId: "pay-1",
      status: "REQUESTED",
      purpose: "INCOME",
      amount: 330_000,
      providerBillId: null,
      invoice: { studentId: "student-1", student: { name: "김하늘" } },
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.mocked(prisma.tuitionCashReceipt.findUnique).mockResolvedValue(storedReceipt() as never);
    vi.mocked(prisma.tuitionCashReceipt.updateMany).mockResolvedValue({ count: 1 } as never);
    // 신청 뒤 3만원 환불됨, 과세
    tx.tuitionCashReceipt.findUnique.mockResolvedValue({
      status: "REQUESTED",
      purpose: "INCOME",
      identifier: "01012345678",
      providerBillId: null,
      payment: { paidAmount: 330_000, refundedAmount: 30_000, invoice: { taxType: "TAXABLE" } },
    });
    api.newKey.mockReturnValue("rKEY1");
    api.issue.mockResolvedValue({ approvalNumber: "103396323" });
    api.get.mockResolvedValue(null);
    api.cancel.mockResolvedValue(undefined);
  });

  it("발급 번호를 먼저 적고 발급한 뒤, 승인번호와 남은 수납액(공급가액·세액)으로 기록한다", async () => {
    await expect(issueCashReceiptWithProvider("receipt-1", actor)).resolves.toEqual({ approvalNumber: "103396323" });

    expect(tx.tuitionCashReceipt.update).toHaveBeenCalledWith({ where: { id: "receipt-1" }, data: { providerBillId: "rKEY1" } });
    expect(tx.tuitionCashReceipt.update.mock.invocationCallOrder[0]).toBeLessThan(api.issue.mock.invocationCallOrder[0]);
    expect(api.issue).toHaveBeenCalledWith({
      key: "rKEY1",
      amount: 300_000,
      supplyAmount: 272_728,
      taxAmount: 27_272,
      purpose: "INCOME",
      identifier: "01012345678",
      customerName: "김하늘",
    });
    const update = tx.tuitionCashReceipt.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({ id: "receipt-1", status: "REQUESTED", providerBillId: "rKEY1" });
    expect(update.data).toMatchObject({ status: "ISSUED", amount: 300_000, approvalNumber: "103396323", issuedById: "user-1" });
    expect(tx.tuitionEvent.create.mock.calls[0][0].data.type).toBe("CASH_RECEIPT_ISSUED");
  });

  it("앞선 시도가 응답 없이 끝난 건은 조회부터 — 이미 발급됐으면 다시 발급하지 않고 결제선생 값으로 기록한다", async () => {
    tx.tuitionCashReceipt.findUnique.mockResolvedValue({
      status: "REQUESTED",
      purpose: "INCOME",
      identifier: "01011112222",
      providerBillId: "rOLD",
      payment: { paidAmount: 330_000, refundedAmount: 0, invoice: { taxType: "EXEMPT" } },
    });
    api.get.mockResolvedValue({
      status: "ISSUED",
      approvalNumber: "111",
      amount: 330_000,
      supplyAmount: 330_000,
      taxAmount: 0,
      purpose: "INCOME",
      identifier: "01099998888",
    });

    await expect(issueCashReceiptWithProvider("receipt-1", actor)).resolves.toEqual({ approvalNumber: "111" });
    expect(api.issue).not.toHaveBeenCalled();
    expect(tx.tuitionCashReceipt.update).not.toHaveBeenCalled();
    expect(tx.tuitionCashReceipt.updateMany.mock.calls[0][0].data).toMatchObject({
      approvalNumber: "111",
      identifier: "01099998888",
    });
  });

  it("결제선생이 거절하면 번호를 비워 다음 시도가 새 번호로 하게 한다", async () => {
    api.issue.mockRejectedValue(new ProviderError("5012:확인요망", "rejected", "PAYMENT_001"));
    await expect(issueCashReceiptWithProvider("receipt-1", actor)).rejects.toMatchObject({ code: "PROVIDER_REJECTED" });
    expect(vi.mocked(prisma.tuitionCashReceipt.updateMany).mock.calls[0][0]).toMatchObject({
      where: { providerBillId: "rKEY1", status: "REQUESTED" },
      data: { providerBillId: null },
    });
    expect(tx.tuitionCashReceipt.updateMany).not.toHaveBeenCalled();
  });

  it("응답이 없으면 번호를 남긴 채 발급 필요에 머문다", async () => {
    api.issue.mockRejectedValue(new ProviderError("timeout", "unavailable"));
    await expect(issueCashReceiptWithProvider("receipt-1", actor)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    expect(prisma.tuitionCashReceipt.updateMany).not.toHaveBeenCalled();
    expect(tx.tuitionCashReceipt.updateMany).not.toHaveBeenCalled();
  });

  it("같은 번호로 동시에 누른 요청이 먼저 기록했으면 성공 — 영수증을 되돌리지 않는다", async () => {
    tx.tuitionCashReceipt.updateMany.mockResolvedValue({ count: 0 });
    tx.tuitionCashReceipt.findUnique
      .mockResolvedValueOnce({
        status: "REQUESTED",
        purpose: "INCOME",
        identifier: "01012345678",
        providerBillId: null,
        payment: { paidAmount: 330_000, refundedAmount: 0, invoice: { taxType: "EXEMPT" } },
      })
      .mockResolvedValueOnce({ status: "ISSUED", providerBillId: "rKEY1" });
    await expect(issueCashReceiptWithProvider("receipt-1", actor)).resolves.toEqual({ approvalNumber: "103396323" });
    expect(api.cancel).not.toHaveBeenCalled();
  });

  it("발급하는 사이 신청이 취소됐으면 방금 발급한 영수증을 취소한다", async () => {
    tx.tuitionCashReceipt.updateMany.mockResolvedValue({ count: 0 });
    tx.tuitionCashReceipt.findUnique
      .mockResolvedValueOnce({
        status: "REQUESTED",
        purpose: "INCOME",
        identifier: "01012345678",
        providerBillId: null,
        payment: { paidAmount: 330_000, refundedAmount: 0, invoice: { taxType: "EXEMPT" } },
      })
      .mockResolvedValueOnce({ status: "CANCELED", providerBillId: "rKEY1" });
    await expect(issueCashReceiptWithProvider("receipt-1", actor)).rejects.toMatchObject({ httpStatus: 409 });
    expect(api.cancel).toHaveBeenCalledWith("rKEY1", 330_000, "INCOME");
  });

  it("발급 결과를 모르는 건은 홈택스 발급 완료 처리를 막는다", async () => {
    vi.mocked(prisma.tuitionCashReceipt.findUnique).mockResolvedValue(storedReceipt({ providerBillId: "rOLD" }) as never);
    await expect(markCashReceiptIssued("receipt-1", "A12345678", actor)).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("결제선생으로 발급한 건은 결제선생에서 먼저 취소하고 기록한다", async () => {
    vi.mocked(prisma.tuitionCashReceipt.findUnique).mockResolvedValue(
      storedReceipt({ status: "ISSUED", providerBillId: "rKEY1", amount: 300_000 }) as never,
    );
    await cancelCashReceipt("receipt-1", "환불로 재발급", actor);
    expect(api.cancel).toHaveBeenCalledWith("rKEY1", 300_000, "INCOME");
    expect(api.cancel.mock.invocationCallOrder[0]).toBeLessThan(tx.tuitionCashReceipt.updateMany.mock.invocationCallOrder[0]);
    expect(tx.tuitionEvent.create.mock.calls[0][0].data.detail).toContain("(결제선생)");
  });

  it("발급 결과를 모르는 신청을 취소하면 조회해서 발급됐을 때만 결제선생에서 취소한다", async () => {
    vi.mocked(prisma.tuitionCashReceipt.findUnique).mockResolvedValue(storedReceipt({ providerBillId: "rOLD" }) as never);
    await cancelCashReceipt("receipt-1", "번호 잘못 받음", actor);
    expect(api.get).toHaveBeenCalledWith("rOLD", 330_000);
    expect(api.cancel).not.toHaveBeenCalled();
    expect(tx.tuitionCashReceipt.updateMany).toHaveBeenCalled();
  });

  it("결제선생 취소가 실패하면 기록을 바꾸지 않는다", async () => {
    vi.mocked(prisma.tuitionCashReceipt.findUnique).mockResolvedValue(
      storedReceipt({ status: "ISSUED", providerBillId: "rKEY1" }) as never,
    );
    api.cancel.mockRejectedValue(new ProviderError("timeout", "unavailable"));
    await expect(cancelCashReceipt("receipt-1", "환불", actor)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
