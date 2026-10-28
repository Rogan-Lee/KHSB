// 현금영수증 관리 — 현금·계좌이체로 받은 수납에 대해 "누구에게 발급해야 하는지"와 "발급했는지"를 남긴다 (결제당 한 건).
// 발급은 두 가지다:
//  · 결제사(결제선생) API 로 바로 발급 — issueCashReceiptWithProvider. 승인번호를 결제사 응답에서 받는다.
//  · 홈택스 등에서 운영진이 발급하고 승인번호를 적는다 — markCashReceiptIssued.
// 결제사 발급은 발급 번호(providerBillId)를 먼저 적어 두고 부른다. 응답을 못 받으면 그 번호가 남아 있는 채로
// "발급 필요"에 머물고, 다음 발급·취소가 그 번호로 결제사에 결과를 물어 이어 간다.
// 트랜잭션 안에서는 결제사를 부르지 않는다 (연결이 1개뿐 — lock.ts). 호출 측이 권한을 먼저 검증한다.

import type { TuitionCashReceiptPurpose } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { normalizeCashReceiptIdentifier, splitTax } from "@/lib/tuition/calc";
import { recordTuitionEvent } from "@/lib/tuition/events";
import { won } from "@/lib/tuition/format";
import { lockTuitionStudent, TUITION_TX } from "@/lib/tuition/lock";
import { ProviderError, type ProviderCashReceipt, type ProviderCashReceipts } from "@/lib/tuition/provider";
import { getTuitionProvider } from "@/lib/tuition/provider-registry";
import { TuitionError, type TuitionActor } from "@/lib/tuition/types";

/** 현금영수증 대상 결제 수단 — 카드·지역화폐 카드 결제는 카드 매출전표가 영수증이다 */
const CASH_METHODS = ["CASH", "TRANSFER"] as const;

async function studentOfPayment(paymentId: string) {
  const payment = await prisma.tuitionPayment.findUnique({
    where: { id: paymentId },
    select: { invoiceId: true, invoice: { select: { studentId: true } } },
  });
  if (!payment) throw new TuitionError("NOT_FOUND", "결제 내역을 찾을 수 없습니다", 404);
  return { invoiceId: payment.invoiceId, studentId: payment.invoice.studentId };
}

/**
 * 현금영수증 신청 정보 등록 (발급 필요 상태로). 이미 신청이 있으면 내용을 고친다 — 발급 완료된 건은 고칠 수 없다.
 * 금액은 지금 남아 있는 수납액(환불 반영) 기준.
 */
export async function requestCashReceipt(
  input: { paymentId: string; purpose: TuitionCashReceiptPurpose; identifier: string },
  actor: TuitionActor,
): Promise<{ cashReceiptId: string }> {
  if (input.purpose !== "INCOME" && input.purpose !== "EXPENSE") {
    throw new TuitionError("INVALID_INPUT", "발급 구분을 선택해 주세요");
  }
  const parsed = normalizeCashReceiptIdentifier(input.purpose, input.identifier);
  if (!parsed.ok) throw new TuitionError("INVALID_INPUT", parsed.error);
  const { invoiceId, studentId } = await studentOfPayment(input.paymentId);

  return prisma.$transaction(async (tx) => {
    await lockTuitionStudent(tx, studentId);
    const payment = await tx.tuitionPayment.findUnique({
      where: { id: input.paymentId },
      select: {
        method: true,
        status: true,
        paidAmount: true,
        refundedAmount: true,
        isDuplicate: true,
        invoice: { select: { taxType: true } },
        cashReceipt: { select: { id: true, status: true, providerBillId: true } },
      },
    });
    if (!payment) throw new TuitionError("NOT_FOUND", "결제 내역을 찾을 수 없습니다", 404);
    if (payment.status !== "DONE" || payment.isDuplicate || !CASH_METHODS.some((m) => m === payment.method)) {
      throw new TuitionError("INVALID_INPUT", "현금·계좌이체로 받은 수납에만 현금영수증을 등록할 수 있습니다");
    }
    const amount = payment.paidAmount - payment.refundedAmount;
    if (amount <= 0) throw new TuitionError("INVALID_INPUT", "남은 수납 금액이 없어 현금영수증을 등록할 수 없습니다");
    if (payment.cashReceipt?.status === "ISSUED") {
      throw new TuitionError("INVALID_INPUT", "이미 발급 완료된 현금영수증입니다. 취소한 뒤 다시 등록해 주세요", 409);
    }

    const { supplyAmount, taxAmount } = splitTax(amount, payment.invoice.taxType);
    // 결제사 발급 결과를 아직 모르는 신청(발급 필요 + 발급 번호)은 번호를 남긴다 — 다음 발급이 그 번호로 결과를 확인한다
    const keepProviderKey = payment.cashReceipt?.status === "REQUESTED" && payment.cashReceipt.providerBillId !== null;
    const data = {
      purpose: input.purpose,
      identifier: parsed.identifier,
      amount,
      supplyAmount,
      taxAmount,
      status: "REQUESTED" as const,
      approvalNumber: null,
      ...(keepProviderKey ? {} : { providerBillId: null }),
      issuedAt: null,
      issuedById: null,
      issuedByName: null,
      canceledAt: null,
      canceledById: null,
      canceledByName: null,
      cancelReason: null,
      requestedById: actor.id,
      requestedByName: actor.name ?? null,
    };
    const receipt = payment.cashReceipt
      ? await tx.tuitionCashReceipt.update({ where: { id: payment.cashReceipt.id }, data, select: { id: true } })
      : await tx.tuitionCashReceipt.create({
          data: { invoiceId, paymentId: input.paymentId, ...data },
          select: { id: true },
        });
    await recordTuitionEvent(tx, {
      type: "CASH_RECEIPT_REQUESTED",
      source: "STAFF",
      invoiceId,
      paymentId: input.paymentId,
      actor,
      detail: `현금영수증 신청 등록 ${won(amount)} (${input.purpose === "INCOME" ? "소득공제" : "지출증빙"})`,
    });
    return { cashReceiptId: receipt.id };
  }, TUITION_TX);
}

async function loadReceipt(cashReceiptId: string) {
  const receipt = await prisma.tuitionCashReceipt.findUnique({
    where: { id: cashReceiptId },
    select: {
      invoiceId: true,
      paymentId: true,
      status: true,
      purpose: true,
      amount: true,
      providerBillId: true,
      invoice: { select: { studentId: true, student: { select: { name: true } } } },
    },
  });
  if (!receipt) throw new TuitionError("NOT_FOUND", "현금영수증 내역을 찾을 수 없습니다", 404);
  return receipt;
}

/** 발급 완료 처리 — 홈택스 등에서 발급한 뒤 국세청 승인번호를 적는다 */
export async function markCashReceiptIssued(
  cashReceiptId: string,
  approvalNumber: string,
  actor: TuitionActor,
): Promise<void> {
  const number = approvalNumber?.trim() ?? "";
  if (!/^[A-Za-z0-9-]{4,30}$/.test(number)) {
    throw new TuitionError("INVALID_INPUT", "국세청 승인번호를 확인해 주세요");
  }
  const receipt = await loadReceipt(cashReceiptId);
  if (receipt.status === "REQUESTED" && receipt.providerBillId) throw providerPendingError();

  await prisma.$transaction(async (tx) => {
    await lockTuitionStudent(tx, receipt.invoice.studentId);
    // 신청 뒤 환불이 있었을 수 있다 — 발급 금액은 지금 남아 있는 수납액으로 다시 맞춘다
    const payment = await tx.tuitionPayment.findUnique({
      where: { id: receipt.paymentId },
      select: { paidAmount: true, refundedAmount: true, invoice: { select: { taxType: true } } },
    });
    if (!payment) throw new TuitionError("NOT_FOUND", "결제 내역을 찾을 수 없습니다", 404);
    const amount = payment.paidAmount - payment.refundedAmount;
    if (amount <= 0) {
      throw new TuitionError("INVALID_INPUT", "전액 환불된 수납입니다. 현금영수증 신청을 취소해 주세요", 409);
    }
    const { supplyAmount, taxAmount } = splitTax(amount, payment.invoice.taxType);
    const issued = await tx.tuitionCashReceipt.updateMany({
      where: { id: cashReceiptId, status: "REQUESTED", providerBillId: null },
      data: {
        status: "ISSUED",
        amount,
        supplyAmount,
        taxAmount,
        approvalNumber: number,
        issuedAt: new Date(),
        issuedById: actor.id,
        issuedByName: actor.name ?? null,
      },
    });
    if (issued.count !== 1) {
      throw new TuitionError("INVALID_INPUT", "발급 필요 상태인 건만 발급 완료로 바꿀 수 있습니다", 409);
    }
    await recordTuitionEvent(tx, {
      type: "CASH_RECEIPT_ISSUED",
      source: "STAFF",
      invoiceId: receipt.invoiceId,
      paymentId: receipt.paymentId,
      actor,
      detail: `현금영수증 발급 완료 ${won(amount)} · 승인번호 ${number}`,
    });
  }, TUITION_TX);
}

/**
 * 현금영수증 취소 — 신청을 거두거나, 발급한 영수증을 취소한다.
 * 결제사로 발급한(또는 발급 결과를 모르는) 건은 결제사에서 먼저 취소하고, 홈택스로 발급한 건은 취소했다는 기록만 남긴다.
 */
export async function cancelCashReceipt(cashReceiptId: string, reason: string, actor: TuitionActor): Promise<void> {
  const cleanReason = reason?.trim().slice(0, 300) ?? "";
  if (!cleanReason) throw new TuitionError("INVALID_INPUT", "취소 사유를 입력해 주세요");
  const receipt = await loadReceipt(cashReceiptId);

  let providerCanceled = false;
  if (receipt.providerBillId && receipt.status !== "CANCELED") {
    const api = requireCashReceiptApi();
    const key = receipt.providerBillId;
    await callProvider(async () => {
      if (receipt.status === "ISSUED") {
        await api.cancel(key, receipt.amount, receipt.purpose);
        providerCanceled = true;
        return;
      }
      // 발급 결과를 모르는 신청 — 실제로 발급됐으면 취소한다
      const found = await api.get(key, receipt.amount);
      if (found?.status === "ISSUED") {
        await api.cancel(key, found.amount, found.purpose ?? receipt.purpose);
        providerCanceled = true;
      }
    });
  }

  await prisma.$transaction(async (tx) => {
    await lockTuitionStudent(tx, receipt.invoice.studentId);
    const canceled = await tx.tuitionCashReceipt.updateMany({
      where: { id: cashReceiptId, status: { in: ["REQUESTED", "ISSUED"] } },
      data: {
        status: "CANCELED",
        canceledAt: new Date(),
        canceledById: actor.id,
        canceledByName: actor.name ?? null,
        cancelReason: cleanReason,
      },
    });
    if (canceled.count !== 1) throw new TuitionError("INVALID_INPUT", "이미 취소된 현금영수증입니다", 409);
    await recordTuitionEvent(tx, {
      type: "CASH_RECEIPT_CANCELED",
      source: "STAFF",
      invoiceId: receipt.invoiceId,
      paymentId: receipt.paymentId,
      actor,
      detail: `현금영수증 취소${providerCanceled ? "(결제선생)" : ""} ${won(receipt.amount)} — ${cleanReason}`,
    });
  }, TUITION_TX);
}

// ─── 결제사(결제선생) 발급 ─────────────────────────────────────────────

function providerPendingError(): TuitionError {
  return new TuitionError(
    "PROVIDER_UNAVAILABLE",
    "결제선생 발급 결과를 아직 확인하지 못한 건이에요. ‘결제선생으로 발급’을 다시 눌러 결과를 확인해 주세요",
    409,
  );
}

function requireCashReceiptApi(): ProviderCashReceipts {
  const api = getTuitionProvider()?.cashReceipts;
  if (!api) {
    throw new TuitionError("ONLINE_DISABLED", "결제선생이 연결되어 있지 않아 현금영수증을 바로 발급·취소할 수 없어요", 503);
  }
  return api;
}

/** 결제사 오류 → 화면에 보일 업무 오류 */
async function callProvider<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!(error instanceof ProviderError)) throw error;
    if (error.kind === "rejected") {
      throw new TuitionError("PROVIDER_REJECTED", `결제선생이 처리하지 않았어요 — ${error.message}`, 502);
    }
    throw new TuitionError(
      "PROVIDER_UNAVAILABLE",
      "결제선생 응답을 받지 못했어요. 잠시 뒤 다시 누르면 결과를 확인해 이어서 처리해요",
      503,
    );
  }
}

/**
 * 결제사(결제선생)로 현금영수증 발급 — 원장급. 금액은 지금 남아 있는 수납액(환불 반영).
 * 앞선 시도가 응답 없이 끝났으면(발급 번호가 남아 있으면) 먼저 그 번호로 결과를 확인한다 — 두 번 발급되지 않는다.
 */
export async function issueCashReceiptWithProvider(
  cashReceiptId: string,
  actor: TuitionActor,
): Promise<{ approvalNumber: string }> {
  const api = requireCashReceiptApi();
  const receipt = await loadReceipt(cashReceiptId);

  // 1) 발급 번호를 먼저 적어 둔다
  const reserved = await prisma.$transaction(async (tx) => {
    await lockTuitionStudent(tx, receipt.invoice.studentId);
    const row = await tx.tuitionCashReceipt.findUnique({
      where: { id: cashReceiptId },
      select: {
        status: true,
        purpose: true,
        identifier: true,
        providerBillId: true,
        payment: { select: { paidAmount: true, refundedAmount: true, invoice: { select: { taxType: true } } } },
      },
    });
    if (!row) throw new TuitionError("NOT_FOUND", "현금영수증 내역을 찾을 수 없습니다", 404);
    if (row.status !== "REQUESTED") {
      throw new TuitionError("INVALID_INPUT", "발급 필요 상태인 건만 발급할 수 있습니다", 409);
    }
    const amount = row.payment.paidAmount - row.payment.refundedAmount;
    if (amount <= 0) {
      throw new TuitionError("INVALID_INPUT", "전액 환불된 수납입니다. 현금영수증 신청을 취소해 주세요", 409);
    }
    const { supplyAmount, taxAmount } = splitTax(amount, row.payment.invoice.taxType);
    const key = row.providerBillId ?? api.newKey();
    if (!row.providerBillId) {
      await tx.tuitionCashReceipt.update({ where: { id: cashReceiptId }, data: { providerBillId: key } });
    }
    return {
      key,
      resumed: row.providerBillId !== null,
      input: { amount, supplyAmount, taxAmount, purpose: row.purpose, identifier: row.identifier },
    };
  }, TUITION_TX);

  // 2) 결제사 발급 (앞선 시도가 있으면 결과 확인부터)
  let key = reserved.key;
  const input = { ...reserved.input, customerName: receipt.invoice.student.name };
  const issued: ProviderCashReceipt = await callProvider(async () => {
    if (reserved.resumed) {
      const found = await api.get(key, input.amount);
      if (found?.status === "ISSUED") return found;
      if (found?.status === "CANCELED") {
        // 발급 뒤 결제사에서 취소된 번호 — 다시 쓸 수 없으니 새 번호로 바꾼다
        const next = api.newKey();
        const swapped = await prisma.tuitionCashReceipt.updateMany({
          where: { id: cashReceiptId, status: "REQUESTED", providerBillId: key },
          data: { providerBillId: next },
        });
        if (swapped.count !== 1) throw new TuitionError("BUSY", "다른 처리가 진행 중입니다. 잠시 후 다시 시도해 주세요", 409);
        key = next;
      }
    }
    try {
      const { approvalNumber } = await api.issue({ key, ...input });
      return { status: "ISSUED", approvalNumber, ...input };
    } catch (error) {
      if (error instanceof ProviderError && error.code === "DUPLICATE") {
        // 같은 번호로 이미 발급됨 — 동시에 누른 다른 요청이나 앞선 시도가 반영된 것이다
        const found = await api.get(key, input.amount);
        if (found?.status === "ISSUED") return found;
        throw new ProviderError(error.message, "unavailable");
      }
      if (error instanceof ProviderError && error.kind === "rejected") {
        // 명확한 거절 — 번호를 비워 다음 시도가 새 번호로 하게 한다
        await prisma.tuitionCashReceipt.updateMany({
          where: { id: cashReceiptId, status: "REQUESTED", providerBillId: key },
          data: { providerBillId: null },
        });
      }
      throw error;
    }
  });

  // 3) 기록 — 결제사가 알려 준 값(금액·번호)을 그대로 남긴다
  const approvalNumber = issued.approvalNumber;
  if (!approvalNumber) {
    throw new TuitionError("PROVIDER_UNAVAILABLE", "결제선생에서 승인번호를 받지 못했어요. 잠시 뒤 다시 누르면 결과를 확인해요", 503);
  }
  const recorded = await prisma.$transaction(async (tx) => {
    await lockTuitionStudent(tx, receipt.invoice.studentId);
    const done = await tx.tuitionCashReceipt.updateMany({
      where: { id: cashReceiptId, status: "REQUESTED", providerBillId: key },
      data: {
        status: "ISSUED",
        amount: issued.amount,
        supplyAmount: issued.supplyAmount,
        taxAmount: issued.taxAmount,
        ...(issued.purpose ? { purpose: issued.purpose } : {}),
        ...(issued.identifier ? { identifier: issued.identifier } : {}),
        approvalNumber,
        issuedAt: new Date(),
        issuedById: actor.id,
        issuedByName: actor.name ?? null,
      },
    });
    if (done.count !== 1) {
      // 같은 번호로 동시에 누른 다른 요청이 먼저 기록했으면 그대로 성공이다
      const now = await tx.tuitionCashReceipt.findUnique({
        where: { id: cashReceiptId },
        select: { status: true, providerBillId: true },
      });
      return now?.status === "ISSUED" && now.providerBillId === key;
    }
    await recordTuitionEvent(tx, {
      type: "CASH_RECEIPT_ISSUED",
      source: "STAFF",
      invoiceId: receipt.invoiceId,
      paymentId: receipt.paymentId,
      actor,
      detail: `현금영수증 발급(결제선생) ${won(issued.amount)} · 승인번호 ${approvalNumber}`,
    });
    return true;
  }, TUITION_TX);

  if (!recorded) {
    // 발급하는 사이 다른 직원이 신청을 취소했다 — 발급한 영수증을 되돌린다
    await callProvider(() => api.cancel(key, issued.amount, issued.purpose ?? input.purpose));
    throw new TuitionError("INVALID_INPUT", "발급하는 사이 신청이 바뀌어 방금 발급한 영수증을 취소했어요. 다시 확인해 주세요", 409);
  }
  return { approvalNumber };
}
