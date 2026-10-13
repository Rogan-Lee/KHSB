// 환불. 호출 측이 원장급 권한을 먼저 검증한다.
//
// 온라인 결제 환불은 두 단계다:
//  1) 락 안에서 금액을 검증하고 환불 행을 PENDING 으로 먼저 남긴다 (멱등키도 이때 확정)
//  2) 트랜잭션 밖에서 결제사에 취소를 요청하고, 돌아온 주문을 settle.ts 로 반영해 DONE 으로 묶는다
// 2)에서 응답을 못 받아도 PENDING 행이 남아 있어 대조 작업이 재조회·재시도한다 (같은 멱등키 → 한 번만 환불).
// 현장 결제(단말기·현금) 환불은 운영진이 직접 돌려준 뒤 기록만 남긴다.
// 전액 취소만 되는 결제사(결제선생)의 온라인 결제도, 일부 금액 환불은 같은 방식으로 직접 돌려준 뒤 기록한다.

import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { notifySlack } from "@/lib/slack";
import { addDays, parseDateKey } from "@/lib/tuition/calc";
import { dispatchTuitionEffects, type TuitionEffect } from "@/lib/tuition/effects";
import { recordTuitionEvent } from "@/lib/tuition/events";
import { won } from "@/lib/tuition/format";
import { lockTuitionStudent, TUITION_TX } from "@/lib/tuition/lock";
import { ProviderError } from "@/lib/tuition/provider";
import { getTuitionProvider } from "@/lib/tuition/provider-registry";
import { applyProviderOrderNow, recomputeRefundTotals } from "@/lib/tuition/settle";
import { TuitionError, type TuitionActor, type TuitionRefundAccount } from "@/lib/tuition/types";

export type RequestRefundInput = {
  invoiceId: string;
  /** 생략 = 납부로 확정된 결제. 중복 결제 환불을 다시 시도할 때만 지정 */
  paymentId?: string;
  amount: number;
  reason: string;
  /** YYYY-MM-DD = 마지막 이용일 · null = 이용 전 환불 · 생략 = 이용 기간 유지 */
  lastUsedDate?: string | null;
  /** 계산 근거 (suggestRefund 의 basis) */
  calcBasis?: string | null;
  /** 가상계좌 결제일 때 필수 — 저장하지 않고 결제사에 전달만 한다 */
  refundAccount?: TuitionRefundAccount;
  /** 현장 결제 환불 — 단말기·계좌로 환불을 끝냈음을 운영진이 확인 */
  manualConfirmed?: boolean;
};

export type RefundOutcome = { status: "PENDING" | "DONE" | "FAILED"; failMessage: string | null };

const MAX_REASON_LEN = 300;

function isVirtualAccount(providerMethod: string | null): boolean {
  return !!providerMethod && providerMethod.includes("가상계좌");
}

/**
 * 환불 방식 — 온라인 결제는 결제사 취소(PROVIDER), 현장 결제는 직접 환불 기록(MANUAL).
 * 전액 취소만 되는 결제사로 받은 결제는 "한 번도 환불하지 않은 결제의 전액"만 결제사로 취소할 수 있다.
 * 그 밖(일부 금액, 이미 일부를 돌려준 결제)은 직접 환불한 뒤 기록한다.
 */
export function refundMethodFor(
  payment: { method: string; paidAmount: number; refundedAmount: number },
  amount: number,
): "PROVIDER" | "MANUAL" {
  if (payment.method !== "LINK") return "MANUAL";
  const provider = getTuitionProvider();
  if (provider && !provider.partialCancel) {
    const fullCancel = payment.refundedAmount === 0 && amount === payment.paidAmount;
    if (!fullCancel) return "MANUAL";
  }
  return "PROVIDER";
}

function cleanRefundAccount(account: TuitionRefundAccount | undefined): TuitionRefundAccount | undefined {
  if (!account) return undefined;
  const bank = account.bank?.trim();
  const accountNumber = account.accountNumber?.replace(/[^0-9]/g, "");
  const holderName = account.holderName?.trim();
  if (!bank || !accountNumber || !holderName) return undefined;
  return { bank: bank.slice(0, 30), accountNumber: accountNumber.slice(0, 30), holderName: holderName.slice(0, 40) };
}

export async function requestRefund(
  input: RequestRefundInput,
  actor: TuitionActor,
): Promise<{ refundId: string } & RefundOutcome> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new TuitionError("INVALID_INPUT", "환불 금액을 확인해 주세요");
  }
  const reason = input.reason?.trim().slice(0, MAX_REASON_LEN);
  if (!reason) throw new TuitionError("INVALID_INPUT", "환불 사유를 입력해 주세요");
  let lastUsed: Date | null | undefined;
  if (typeof input.lastUsedDate === "string") {
    const parsed = parseDateKey(input.lastUsedDate);
    if (!parsed) throw new TuitionError("INVALID_INPUT", "마지막 이용일을 확인해 주세요");
    lastUsed = parsed;
  } else {
    lastUsed = input.lastUsedDate; // null = 이용 전, undefined = 이용 기간 유지
  }
  const refundAccount = cleanRefundAccount(input.refundAccount);

  const found = await prisma.tuitionInvoice.findUnique({
    where: { id: input.invoiceId },
    select: { studentId: true },
  });
  if (!found) throw new TuitionError("NOT_FOUND", "청구서를 찾을 수 없습니다", 404);

  const created = await prisma.$transaction(async (tx) => {
    await lockTuitionStudent(tx, found.studentId);

    const invoice = await tx.tuitionInvoice.findUnique({
      where: { id: input.invoiceId },
      select: { paidPaymentId: true, periodStart: true, periodEnd: true },
    });
    if (!invoice) throw new TuitionError("NOT_FOUND", "청구서를 찾을 수 없습니다", 404);

    const paymentId = input.paymentId ?? invoice.paidPaymentId;
    const payment = paymentId
      ? await tx.tuitionPayment.findUnique({
          where: { id: paymentId },
          select: {
            id: true,
            invoiceId: true,
            method: true,
            status: true,
            paidAmount: true,
            refundedAmount: true,
            isDuplicate: true,
            providerMethod: true,
          },
        })
      : null;
    const isPaidPayment = !!payment && invoice.paidPaymentId === payment.id;
    if (
      !payment ||
      payment.invoiceId !== input.invoiceId ||
      payment.status !== "DONE" ||
      payment.paidAmount <= 0 ||
      (!isPaidPayment && !payment.isDuplicate)
    ) {
      throw new TuitionError("NOT_REFUNDABLE", "환불할 수 있는 납부 내역이 없습니다", 409);
    }

    // 결제당 처리 중 환불은 하나만 — 결제사 취소와 우리 환불 행을 금액으로 묶기 때문에 겹치면 안 된다
    const inProgress = await tx.tuitionRefund.count({ where: { paymentId: payment.id, status: "PENDING" } });
    if (inProgress > 0) {
      throw new TuitionError("REFUND_IN_PROGRESS", "처리 중인 환불이 있습니다. 완료된 뒤 다시 시도해 주세요", 409);
    }
    const refundable = payment.paidAmount - payment.refundedAmount;
    if (input.amount > refundable) {
      throw new TuitionError("REFUND_EXCEEDS", `환불 가능 금액(${won(refundable)})을 넘었습니다`, 409);
    }

    const method = refundMethodFor(payment, input.amount);
    if (method === "PROVIDER" && isVirtualAccount(payment.providerMethod) && !refundAccount) {
      throw new TuitionError("REFUND_NEEDS_ACCOUNT", "가상계좌 결제는 환불받을 계좌(은행·계좌번호·예금주)가 필요합니다");
    }
    if (method === "MANUAL" && !input.manualConfirmed) {
      throw new TuitionError(
        "INVALID_INPUT",
        payment.method === "LINK"
          ? "이 결제사는 결제 금액 전체만 취소할 수 있습니다. 일부 금액은 계좌이체 등으로 직접 환불한 뒤 확인란을 체크해 주세요"
          : "단말기·계좌로 환불을 완료한 뒤 확인란을 체크해 주세요",
      );
    }

    // 이용 기간 조정은 납부로 확정된 결제의 환불에만 의미가 있다. 이용 전 환불은 "시작 전날"로 적는다
    let effectiveDate: Date | null = null;
    if (isPaidPayment && lastUsed !== undefined) {
      const beforeStart = addDays(invoice.periodStart, -1);
      effectiveDate =
        lastUsed === null || lastUsed.getTime() < beforeStart.getTime()
          ? beforeStart
          : lastUsed.getTime() > invoice.periodEnd.getTime()
            ? invoice.periodEnd
            : lastUsed;
    }

    const now = new Date();
    const refund = await tx.tuitionRefund.create({
      data: {
        invoiceId: input.invoiceId,
        paymentId: payment.id,
        amount: input.amount,
        reason,
        calcBasis: input.calcBasis?.trim().slice(0, 300) || null,
        effectiveDate,
        method,
        source: "STAFF",
        status: method === "MANUAL" ? "DONE" : "PENDING",
        idempotencyKey: `refund:${randomUUID()}`,
        requestedById: actor.id,
        requestedByName: actor.name ?? null,
        completedAt: method === "MANUAL" ? now : null,
      },
      select: { id: true },
    });
    await recordTuitionEvent(tx, {
      type: "REFUND_REQUESTED",
      source: "STAFF",
      invoiceId: input.invoiceId,
      paymentId: payment.id,
      refundId: refund.id,
      actor,
      detail: `환불 요청 ${won(input.amount)} — ${reason}`,
    });

    const effects: TuitionEffect[] = [];
    if (method === "MANUAL") {
      await recomputeRefundTotals(tx, payment.id);
      await recordTuitionEvent(tx, {
        type: "REFUND_DONE",
        source: "STAFF",
        invoiceId: input.invoiceId,
        paymentId: payment.id,
        refundId: refund.id,
        actor,
        detail: `환불 완료 ${won(input.amount)} (${payment.method === "LINK" ? "직접 환불 확인" : "현장 환불 확인"})`,
      });
      if (isPaidPayment) {
        effects.push({
          kind: "notice",
          invoiceId: input.invoiceId,
          noticeKind: "REFUND",
          refundAmount: input.amount,
        });
      }
    }
    return { refundId: refund.id, method, effects };
  }, TUITION_TX);

  dispatchTuitionEffects(created.effects);
  if (created.method === "MANUAL") return { refundId: created.refundId, status: "DONE", failMessage: null };

  const outcome = await processRefund(created.refundId, { refundAccount });
  return { refundId: created.refundId, ...outcome };
}

/** 처리 중 환불을 실패로 닫는다 (결제사 거절, 계좌 필요, 장시간 미확인). 금액 합계는 바뀌지 않는다 */
export async function failRefund(refundId: string, code: string | null, message: string): Promise<RefundOutcome> {
  const refund = await prisma.tuitionRefund.findUnique({
    where: { id: refundId },
    select: {
      amount: true,
      source: true,
      invoiceId: true,
      paymentId: true,
      invoice: { select: { studentId: true, title: true, student: { select: { name: true } } } },
    },
  });
  if (!refund) return { status: "FAILED", failMessage: message };
  const failMessage = message.slice(0, 300);

  const failed = await prisma.$transaction(async (tx) => {
    await lockTuitionStudent(tx, refund.invoice.studentId);
    const updated = await tx.tuitionRefund.updateMany({
      where: { id: refundId, status: "PENDING" },
      data: { status: "FAILED", failCode: code, failMessage },
    });
    if (updated.count !== 1) return false;
    await recordTuitionEvent(tx, {
      type: "REFUND_FAILED",
      source: "SYSTEM",
      invoiceId: refund.invoiceId,
      paymentId: refund.paymentId,
      refundId,
      detail: `환불 실패 ${won(refund.amount)} — ${failMessage}`,
    });
    return true;
  }, TUITION_TX);

  if (!failed) {
    // 그 사이에 완료로 묶였을 수 있다 — 지금 상태를 그대로 돌려준다
    const current = await prisma.tuitionRefund.findUnique({
      where: { id: refundId },
      select: { status: true, failMessage: true },
    });
    return { status: current?.status ?? "FAILED", failMessage: current?.failMessage ?? null };
  }
  // 자동 환불이 실패하면 받은 돈이 그대로 남아 있다 — 사람이 처리해야 하므로 알린다
  if (refund.source === "AUTO_DUPLICATE") {
    await notifySlack(
      `[수강료·확인 필요] ${refund.invoice.student.name} ${refund.invoice.title} 중복 결제 ${won(refund.amount)} 자동 환불 실패 — ${failMessage}. 어드민 수강료 화면의 "처리 필요"에서 환불을 다시 진행해 주세요.`,
    );
  }
  return { status: "FAILED", failMessage };
}

/**
 * 처리 중(PENDING) 환불을 결제사에 (다시) 요청한다.
 * 환불 행의 멱등키를 그대로 쓰므로 여러 번 불러도 결제사에서는 한 번만 환불된다.
 */
export async function processRefund(
  refundId: string,
  options: { refundAccount?: TuitionRefundAccount } = {},
): Promise<RefundOutcome> {
  const refund = await prisma.tuitionRefund.findUnique({
    where: { id: refundId },
    select: {
      status: true,
      method: true,
      amount: true,
      reason: true,
      idempotencyKey: true,
      failMessage: true,
      payment: { select: { providerOrderKey: true, providerMethod: true } },
    },
  });
  if (!refund) throw new TuitionError("NOT_FOUND", "환불 내역을 찾을 수 없습니다", 404);
  if (refund.status !== "PENDING") return { status: refund.status, failMessage: refund.failMessage };
  if (refund.method !== "PROVIDER") return { status: "PENDING", failMessage: null };

  const provider = getTuitionProvider();
  if (!provider) {
    return { status: "PENDING", failMessage: "결제사 연동이 꺼져 있어 환불 요청을 보내지 못했습니다" };
  }
  const orderKey = refund.payment.providerOrderKey;
  if (!orderKey) return failRefund(refundId, "NO_ORDER", "결제 주문 정보를 찾을 수 없습니다");

  const refundAccount = cleanRefundAccount(options.refundAccount);
  if (isVirtualAccount(refund.payment.providerMethod) && !refundAccount) {
    return failRefund(refundId, "REFUND_NEEDS_ACCOUNT", "가상계좌 결제는 환불받을 계좌가 필요합니다");
  }

  await prisma.tuitionRefund.updateMany({
    where: { id: refundId, status: "PENDING" },
    data: { attemptCount: { increment: 1 }, lastAttemptAt: new Date() },
  });

  try {
    const order = await provider.cancelOrder({
      orderKey,
      amount: refund.amount,
      reason: refund.reason,
      idempotencyKey: refund.idempotencyKey,
      refundAccount,
    });
    // 돌아온 주문의 취소 내역을 반영 — 이 환불 행이 결제사 취소 거래와 묶여 DONE 이 된다
    await applyProviderOrderNow(order, "SYSTEM");
  } catch (error) {
    if (error instanceof ProviderError && error.kind === "rejected") {
      return failRefund(refundId, error.code, error.message);
    }
    // 결제사 응답 없음, 또는 취소는 됐는데 반영 중 오류 — 결과를 알 수 없으니 PENDING 으로 두고 대조에 맡긴다
    if (!(error instanceof ProviderError)) {
      console.error("[tuition:refund]", error instanceof Error ? error.message : error);
    }
    return {
      status: "PENDING",
      failMessage: "결제사 응답을 확인하지 못해 처리 중입니다. 잠시 후 자동으로 다시 확인합니다",
    };
  }

  const current = await prisma.tuitionRefund.findUnique({
    where: { id: refundId },
    select: { status: true, failMessage: true },
  });
  return { status: current?.status ?? "PENDING", failMessage: current?.failMessage ?? null };
}
