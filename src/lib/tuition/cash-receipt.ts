// 현금영수증 관리 — 현금·계좌이체로 받은 수납에 대해 "누구에게 발급해야 하는지"와 "발급했는지"를 남긴다.
// 발급 자체는 홈택스 등에서 운영진이 하고, 여기서는 신청 정보·승인번호·취소를 기록한다 (결제당 한 건).
// 호출 측이 권한을 먼저 검증한다.

import type { TuitionCashReceiptPurpose } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { normalizeCashReceiptIdentifier, splitTax } from "@/lib/tuition/calc";
import { recordTuitionEvent } from "@/lib/tuition/events";
import { won } from "@/lib/tuition/format";
import { lockTuitionStudent, TUITION_TX } from "@/lib/tuition/lock";
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
        cashReceipt: { select: { id: true, status: true } },
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
    const data = {
      purpose: input.purpose,
      identifier: parsed.identifier,
      amount,
      supplyAmount,
      taxAmount,
      status: "REQUESTED" as const,
      approvalNumber: null,
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
    select: { invoiceId: true, paymentId: true, amount: true, invoice: { select: { studentId: true } } },
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
      where: { id: cashReceiptId, status: "REQUESTED" },
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

/** 현금영수증 취소 기록 — 신청을 거두거나, 발급한 영수증을 홈택스에서 취소한 뒤 남긴다 */
export async function cancelCashReceipt(cashReceiptId: string, reason: string, actor: TuitionActor): Promise<void> {
  const cleanReason = reason?.trim().slice(0, 300) ?? "";
  if (!cleanReason) throw new TuitionError("INVALID_INPUT", "취소 사유를 입력해 주세요");
  const receipt = await loadReceipt(cashReceiptId);

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
      detail: `현금영수증 취소 ${won(receipt.amount)} — ${cleanReason}`,
    });
  }, TUITION_TX);
}
