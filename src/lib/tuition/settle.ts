// 결제사 주문을 우리 청구서·결제·환불에 반영한다 — 웹훅 · 앱 동기화 · 어드민 새로고침 · 대조(cron)가 전부 이 함수를 쓴다.
//
// 원칙:
//  · 몇 번을 불러도 결과가 같다 (웹훅 재전송, 웹훅과 동기화가 동시에 와도 한 번만 반영).
//  · 결제사가 "돈을 받았다"고 하면 우리 결제 행이 어떤 상태(닫힘·실패)였든 DONE 으로 기록한다.
//    그다음 청구서 납부로 인정되면 PAID, 아니면(중복·금액 불일치·취소된 청구서) 자동 환불 대상으로 남긴다.
//    닫힌 행이라고 무시하면 받은 돈이 기록 없이 떠 버린다.
//  · 환불(취소)은 결제사 취소 거래 키로 한 번만 반영하고, 환불 합계는 더하지 않고 매번 다시 계산한다.

import type { Prisma } from "@/generated/prisma/client";
import type { TuitionInvoiceStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { refundState } from "@/lib/tuition/calc";
import {
  dispatchTuitionEffects,
  runTuitionEffects,
  type TuitionEffect,
} from "@/lib/tuition/effects";
import { recordTuitionEvent } from "@/lib/tuition/events";
import { won } from "@/lib/tuition/format";
import { lockTuitionStudent, TUITION_TX } from "@/lib/tuition/lock";
import { closeLivePayments } from "@/lib/tuition/payment-rows";
import { orderWasPaid, providerCancelKey, type ProviderOrder } from "@/lib/tuition/provider";
import { getTuitionProvider } from "@/lib/tuition/provider-registry";
import type { TuitionEventSource } from "@/lib/tuition/types";

export type ApplyOutcome = "PAID" | "DUPLICATE" | "WAITING_DEPOSIT" | "CANCELS_APPLIED" | "NOOP" | "UNMATCHED";

type ApplySource = Extract<TuitionEventSource, "WEBHOOK" | "SYNC" | "CRON" | "SYSTEM">;
type ApplyResult = { outcome: ApplyOutcome; invoiceId: string | null; effects: TuitionEffect[] };

/** 재조회 간격 제한 — 앱이 결제 직후 연달아 동기화를 불러도 결제사 호출은 이 간격으로만 */
const SYNC_THROTTLE_MS = 5_000;

/** 주문이 어느 결제 행(결제 링크)에서 나온 것인지 찾는다 */
async function findBasePayment(order: ProviderOrder) {
  const select = { id: true, invoice: { select: { id: true, studentId: true } } } as const;
  const byOrder = await prisma.tuitionPayment.findUnique({
    where: { providerOrderKey: order.orderKey },
    select,
  });
  if (byOrder) return byOrder;
  if (order.productKey) {
    const byProduct = await prisma.tuitionPayment.findUnique({
      where: { providerProductKey: order.productKey },
      select,
    });
    if (byProduct) return byProduct;
  }
  if (order.metaPaymentId) {
    return prisma.tuitionPayment.findFirst({
      where: { id: order.metaPaymentId, method: "LINK" },
      select,
    });
  }
  return null;
}

/**
 * 환불 합계를 환불 행에서 다시 계산해 결제 행과 청구서에 반영한다.
 * 청구서 금액은 "납부로 확정된 결제"의 환불만 센다 (중복 결제의 자동 환불은 청구서 금액과 무관).
 */
export async function recomputeRefundTotals(
  tx: Prisma.TransactionClient,
  paymentId: string,
): Promise<void> {
  const payment = await tx.tuitionPayment.findUnique({
    where: { id: paymentId },
    select: { id: true, paidAmount: true, invoiceId: true },
  });
  if (!payment) return;
  const done = await tx.tuitionRefund.findMany({
    where: { paymentId, status: "DONE" },
    select: { amount: true, effectiveDate: true, source: true },
  });
  const refunded = Math.min(
    payment.paidAmount,
    done.reduce((sum, r) => sum + r.amount, 0),
  );
  await tx.tuitionPayment.update({ where: { id: paymentId }, data: { refundedAmount: refunded } });

  const invoice = await tx.tuitionInvoice.findUnique({
    where: { id: payment.invoiceId },
    select: { id: true, paidPaymentId: true, paidAmount: true, periodStart: true, periodEnd: true },
  });
  if (!invoice || invoice.paidPaymentId !== paymentId) return;

  const state = refundState({
    paidAmount: invoice.paidAmount,
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    refunds: done.map((r) => ({ amount: r.amount, effectiveDate: r.effectiveDate, byStaff: r.source === "STAFF" })),
  });
  await tx.tuitionInvoice.update({
    where: { id: invoice.id },
    data: { refundedAmount: state.refunded, status: state.status, coverageEnd: state.coverageEnd },
  });
}

async function applyOrder(order: ProviderOrder, source: ApplySource): Promise<ApplyResult> {
  const base = await findBasePayment(order);
  if (!base) return { outcome: "UNMATCHED", invoiceId: null, effects: [] };
  const invoiceId = base.invoice.id;

  const result = await prisma.$transaction(async (tx): Promise<{ outcome: ApplyOutcome; effects: TuitionEffect[] }> => {
    await lockTuitionStudent(tx, base.invoice.studentId);

    const effects: TuitionEffect[] = [];
    const now = new Date();
    const invoice = await tx.tuitionInvoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        status: true,
        amount: true,
        title: true,
        periodEnd: true,
        paidPaymentId: true,
        student: { select: { name: true } },
      },
    });
    const baseRow = await tx.tuitionPayment.findUnique({ where: { id: base.id } });
    if (!invoice || !baseRow) return { outcome: "NOOP", effects };

    // ── 이 주문을 담을 결제 행 ──
    // 링크 하나에 주문이 둘 생길 수 있다 (재고 제한이 안 먹거나, 가상계좌 대기 중에 카드로 다시 결제).
    // 이미 다른 주문이 붙은 행이면 두 번째 주문용 행을 따로 만든다 — 그래야 그 돈도 기록되고 환불할 수 있다.
    let row = baseRow;
    if (baseRow.providerOrderKey !== null && baseRow.providerOrderKey !== order.orderKey) {
      const sibling = await tx.tuitionPayment.findUnique({ where: { providerOrderKey: order.orderKey } });
      if (sibling) {
        row = sibling;
      } else if (order.status === "WAITING_FOR_DEPOSIT" || orderWasPaid(order, false)) {
        row = await tx.tuitionPayment.create({
          data: {
            invoiceId,
            method: "LINK",
            status: "PENDING",
            amount: baseRow.amount,
            expiresAt: baseRow.expiresAt,
            linkSourcePaymentId: baseRow.id,
            requestedByAuthUserId: baseRow.requestedByAuthUserId,
            requestedAt: baseRow.requestedAt,
          },
        });
      } else {
        return { outcome: "NOOP", effects };
      }
    }

    const paid = orderWasPaid(order, row.status === "DONE");

    // ── 돈을 받지 않은 주문 ──
    if (!paid) {
      if (order.status === "WAITING_FOR_DEPOSIT") {
        if (row.status !== "PENDING" || invoice.status !== "REQUESTED") {
          // 이미 닫힌 결제·청구서의 가상계좌 — 입금되지 않게 주문을 닫는다 (못 닫아도 입금되면 자동 환불된다)
          effects.push({ kind: "voidOrders", orderKeys: [order.orderKey] });
          return { outcome: "NOOP", effects };
        }
        const firstSeen = row.providerOrderKey !== order.orderKey;
        await tx.tuitionPayment.update({
          where: { id: row.id },
          data: {
            providerOrderKey: order.orderKey,
            providerPaymentKey: order.paymentKey,
            providerMethod: order.method,
            depositBank: order.virtualAccount?.bank ?? null,
            depositAccount: order.virtualAccount?.accountNumber ?? null,
            depositDueAt: order.virtualAccount?.dueDate ?? null,
            lastSyncedAt: now,
          },
        });
        if (firstSeen) {
          await recordTuitionEvent(tx, {
            type: "DEPOSIT_WAITING",
            source,
            invoiceId,
            paymentId: row.id,
            detail: "가상계좌 발급 — 입금 대기",
          });
        }
        return { outcome: "WAITING_DEPOSIT", effects };
      }

      // 결제되지 않고 끝난 주문 (입금 기한 만료·입금 전 취소 등). 재고가 소진된 링크라 다시 쓸 수 없으니 닫는다.
      // 결제사에서 청구서가 파기된 경우(linkClosed)도 같다 — 그 링크로는 더 결제할 수 없으니 다음 결제는 새 링크로 한다.
      const linkClosed =
        order.linkClosed === true && row.providerOrderKey === null && row.providerProductKey === order.productKey;
      if (row.status === "PENDING" && (row.providerOrderKey === order.orderKey || linkClosed)) {
        await tx.tuitionPayment.update({
          where: { id: row.id },
          data: {
            status: "CANCELED",
            closedReason: "EXPIRED",
            depositBank: null,
            depositAccount: null,
            depositDueAt: null,
            lastSyncedAt: now,
          },
        });
        await recordTuitionEvent(tx, {
          type: "PAYMENT_CLOSED",
          source,
          invoiceId,
          paymentId: row.id,
          detail: linkClosed ? "결제사에서 청구서가 파기됨" : "결제되지 않고 종료 (입금 기한 만료 또는 취소)",
        });
      }
      return { outcome: "NOOP", effects };
    }

    // ── 돈을 받은 주문 ──
    let outcome: ApplyOutcome = "NOOP";
    // 받았다가 이미 전액 취소된 결제를 지금 처음 보는 경우 — 남은 돈이 없으니 납부로 잡지도, 자동 환불하지도 않는다.
    // 결제와 취소 기록만 남기고 청구서는 결제 요청 상태로 둔다 (다시 결제할 수 있다).
    const settledElsewhere = row.status !== "DONE" && order.status === "CANCELED";
    if (row.status !== "DONE") {
      row = await tx.tuitionPayment.update({
        where: { id: row.id },
        data: {
          status: "DONE",
          closedReason: null,
          paidAmount: order.amount,
          providerOrderKey: order.orderKey,
          providerPaymentKey: order.paymentKey,
          providerMethod: order.method,
          approvedAt: order.approvedAt ?? now,
          receiptUrl: order.receiptUrl,
          cardIssuer: order.card?.issuer ?? null,
          cardType: order.card?.cardType ?? null,
          installmentMonths: order.card?.installmentMonths ?? null,
          approvalNumber: order.card?.approvalNumber ?? null,
          depositBank: null,
          depositAccount: null,
          depositDueAt: null,
          failCode: null,
          failMessage: null,
          lastSyncedAt: now,
        },
      });
    } else {
      await tx.tuitionPayment.update({ where: { id: row.id }, data: { lastSyncedAt: now } });
    }

    if (invoice.paidPaymentId !== row.id && !row.isDuplicate && !settledElsewhere) {
      // 납부 확정은 청구서당 한 번 — 조건부 갱신으로 선점한다. 금액이 다르면 납부로 인정하지 않는다
      const claimed =
        invoice.status === "REQUESTED" && order.amount === invoice.amount
          ? (
              await tx.tuitionInvoice.updateMany({
                where: { id: invoiceId, status: "REQUESTED", paidPaymentId: null },
                data: {
                  status: "PAID",
                  paidAt: order.approvedAt ?? now,
                  paidAmount: order.amount,
                  paidPaymentId: row.id,
                  coverageEnd: invoice.periodEnd,
                },
              })
            ).count === 1
          : false;

      if (claimed) {
        outcome = "PAID";
        effects.push(...(await closeLivePayments(tx, invoiceId, "INVOICE_PAID", { exceptPaymentId: row.id })));
        await recordTuitionEvent(tx, {
          type: "PAYMENT_DONE",
          source,
          invoiceId,
          paymentId: row.id,
          detail: `온라인 결제 완료 ${won(order.amount)}${order.method ? ` (${order.method})` : ""}`,
        });
        effects.push({ kind: "notice", invoiceId, noticeKind: "PAID" });
        effects.push({
          kind: "slack",
          text: `[수강료] ${invoice.student.name} ${invoice.title} ${won(order.amount)} 온라인 결제 완료`,
        });
      } else {
        outcome = "DUPLICATE";
        const why =
          invoice.status === "CANCELED"
            ? "취소된 청구서에 결제됨"
            : order.amount !== invoice.amount
              ? `금액 불일치 (청구 ${won(invoice.amount)} · 결제 ${won(order.amount)})`
              : "이미 납부된 청구서에 중복 결제됨";
        row = await tx.tuitionPayment.update({ where: { id: row.id }, data: { isDuplicate: true } });
        await recordTuitionEvent(tx, {
          type: "PAYMENT_DUPLICATE",
          source,
          invoiceId,
          paymentId: row.id,
          detail: `${why} — ${won(order.amount)} 자동 환불 대상`,
        });

        // 결제당 자동 환불은 한 건 — 멱등키 유니크가 중복 생성을 막는다
        const alreadyCanceled = order.cancels.reduce((sum, c) => sum + c.amount, 0);
        const refundAmount = order.amount - alreadyCanceled;
        const idempotencyKey = `auto-dup:${row.id}`;
        if (refundAmount > 0) {
          const created = await tx.tuitionRefund.createMany({
            data: [
              {
                invoiceId,
                paymentId: row.id,
                amount: refundAmount,
                reason: `${why} — 자동 환불`,
                method: "PROVIDER",
                source: "AUTO_DUPLICATE",
                idempotencyKey,
              },
            ],
            skipDuplicates: true,
          });
          if (created.count === 1) {
            const refund = await tx.tuitionRefund.findUnique({
              where: { idempotencyKey },
              select: { id: true },
            });
            if (refund) effects.push({ kind: "processRefund", refundId: refund.id });
            effects.push({
              kind: "slack",
              text: `[수강료·확인 필요] ${invoice.student.name} ${invoice.title} — ${why}. ${won(refundAmount)} 자동 환불을 진행합니다.`,
            });
          }
        }
      }
    }

    // ── 취소(환불) 반영 — 결제사 취소 거래마다 한 번만 ──
    if (order.cancels.length > 0) {
      const refunds = await tx.tuitionRefund.findMany({
        where: { paymentId: row.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, amount: true, status: true, source: true, providerTransactionKey: true },
      });
      const known = new Set(refunds.map((r) => r.providerTransactionKey).filter((k): k is string => !!k));
      const pending = refunds.filter((r) => r.status === "PENDING" && !r.providerTransactionKey);
      let changed = false;

      for (const cancel of order.cancels) {
        if (cancel.amount <= 0) continue;
        const key = providerCancelKey(order.orderKey, cancel);
        if (known.has(key)) continue;
        known.add(key);
        changed = true;

        // 우리가 요청해 둔 환불(처리 중)이면 그 행을 완료로 묶고, 아니면 결제사에서 직접 취소한 것으로 기록한다
        const matchIndex = pending.findIndex((r) => r.amount === cancel.amount);
        if (matchIndex >= 0) {
          const [match] = pending.splice(matchIndex, 1);
          await tx.tuitionRefund.update({
            where: { id: match.id },
            data: {
              status: "DONE",
              providerTransactionKey: key,
              completedAt: cancel.canceledAt ?? now,
              failCode: null,
              failMessage: null,
            },
          });
          await recordTuitionEvent(tx, {
            type: "REFUND_DONE",
            source,
            invoiceId,
            paymentId: row.id,
            refundId: match.id,
            detail: `환불 완료 ${won(cancel.amount)}`,
          });
          if (match.source === "STAFF" && invoice.paidPaymentId === row.id) {
            effects.push({ kind: "notice", invoiceId, noticeKind: "REFUND", refundAmount: cancel.amount });
          }
        } else {
          const external = await tx.tuitionRefund.create({
            data: {
              invoiceId,
              paymentId: row.id,
              amount: cancel.amount,
              reason: cancel.reason?.slice(0, 300) || "결제사에서 직접 취소",
              method: "PROVIDER",
              source: "EXTERNAL",
              status: "DONE",
              idempotencyKey: `ext:${key}`,
              providerTransactionKey: key,
              completedAt: cancel.canceledAt ?? now,
            },
            select: { id: true },
          });
          await recordTuitionEvent(tx, {
            type: "REFUND_EXTERNAL",
            source,
            invoiceId,
            paymentId: row.id,
            refundId: external.id,
            detail: `결제사에서 직접 취소됨 ${won(cancel.amount)} — 이용 기간 확인 필요`,
          });
          if (invoice.paidPaymentId === row.id || outcome === "PAID") {
            await tx.tuitionInvoice.update({ where: { id: invoiceId }, data: { needsReview: true } });
            effects.push({
              kind: "slack",
              text: `[수강료·확인 필요] ${invoice.student.name} ${invoice.title} — 결제사에서 ${won(cancel.amount)}이 직접 취소됐습니다. 이용 기간을 확인해 주세요.`,
            });
          }
        }
      }

      if (changed) {
        await recomputeRefundTotals(tx, row.id);
        if (outcome === "NOOP") outcome = "CANCELS_APPLIED";
      }
    }

    return { outcome, effects };
  }, TUITION_TX);

  return { ...result, invoiceId };
}

/** 결제사 주문 반영. 푸시·Slack·자동 환불 같은 커밋 뒤 작업은 응답 뒤로 넘긴다 */
export async function applyProviderOrder(
  order: ProviderOrder,
  source: "WEBHOOK" | "SYNC" | "CRON",
): Promise<{ outcome: ApplyOutcome; invoiceId: string | null }> {
  const { effects, ...result } = await applyOrder(order, source);
  dispatchTuitionEffects(effects);
  return result;
}

/** 결제사 주문 반영 + 커밋 뒤 작업까지 끝내고 돌아온다 (대조·동기화처럼 결과를 바로 써야 하는 경로) */
export async function applyProviderOrderNow(
  order: ProviderOrder,
  source: ApplySource,
): Promise<{ outcome: ApplyOutcome; invoiceId: string | null }> {
  const { effects, ...result } = await applyOrder(order, source);
  await runTuitionEffects(effects);
  return result;
}

/** 웹훅 처리 — 본문은 믿지 않고 orderKey 로 결제사에 다시 조회한 값만 반영한다 */
export async function handleProviderWebhook(orderKey: string): Promise<{ outcome: ApplyOutcome | "IGNORED" }> {
  const provider = getTuitionProvider();
  if (!provider) return { outcome: "IGNORED" };

  // 조회 실패(결제사 응답 없음)는 그대로 던진다 — 웹훅 라우트가 500 을 돌려주면 결제사가 다시 보낸다
  const order = await provider.getOrder(orderKey);
  if (!order) return { outcome: "IGNORED" };

  const result = await applyProviderOrder(order, "WEBHOOK");
  if (result.outcome === "UNMATCHED" && order.status !== "NONE") {
    // 수강료 청구서와 이어지지 않는 결제 — 다시 받아도 달라질 게 없으니 200 으로 끝내고 기록만 남긴다
    await recordTuitionEvent(prisma, {
      type: "WEBHOOK_UNMATCHED",
      source: "WEBHOOK",
      detail: `청구서와 연결되지 않은 결제 ${won(order.amount)} (${order.status})`,
    }).catch(() => undefined);
    dispatchTuitionEffects([
      {
        kind: "slack",
        text: `[수강료·확인 필요] 청구서와 연결되지 않은 결제가 들어왔습니다 — ${won(order.amount)} (${order.status}). 결제사 상점관리자에서 확인해 주세요.`,
      },
    ]);
  }
  return { outcome: result.outcome };
}

/**
 * 청구서의 진행 중 결제·환불을 결제사와 맞춘다 (앱이 결제창에서 돌아왔을 때, 어드민 "상태 새로고침", 대조).
 * force 가 아니면 SYNC_THROTTLE_MS 안의 재호출은 결제사를 다시 부르지 않는다.
 */
export async function syncInvoice(
  invoiceId: string,
  source: "SYNC" | "CRON",
  options: { force?: boolean } = {},
): Promise<{ status: TuitionInvoiceStatus; changed: boolean }> {
  const before = await prisma.tuitionInvoice.findUnique({
    where: { id: invoiceId },
    select: { status: true, refundedAmount: true },
  });
  if (!before) return { status: "CANCELED", changed: false };

  const provider = getTuitionProvider();
  if (!provider) return { status: before.status, changed: false };

  // 결제사에 물어볼 게 남은 결제: 결제 대기 중인 링크, 처리 중 환불이 걸린 결제, 환불이 덜 끝난 중복 결제
  const rows = await prisma.tuitionPayment.findMany({
    where: {
      invoiceId,
      method: "LINK",
      OR: [
        { status: "PENDING", providerProductKey: { not: null } },
        { refunds: { some: { status: "PENDING" } } },
        { isDuplicate: true, status: "DONE" },
      ],
    },
    select: {
      id: true,
      status: true,
      providerOrderKey: true,
      providerProductKey: true,
      lastSyncedAt: true,
    },
  });
  if (rows.length === 0) return { status: before.status, changed: false };

  const now = Date.now();
  const due = options.force
    ? rows
    : rows.filter((r) => !r.lastSyncedAt || now - r.lastSyncedAt.getTime() >= SYNC_THROTTLE_MS);
  if (due.length === 0) return { status: before.status, changed: false };

  await prisma.tuitionPayment.updateMany({
    where: { id: { in: due.map((r) => r.id) } },
    data: { lastSyncedAt: new Date() },
  });

  let touched = false;
  // 주문 키를 아직 모르는 링크(웹훅을 못 받은 결제)는 최근 주문 목록에서 링크 키로 찾는다.
  // 링크가 곧 주문인 결제사는 목록이 없으므로 링크 키로 바로 조회한다.
  let recent: ProviderOrder[] | null = null;
  for (const row of due) {
    const orders: ProviderOrder[] = [];
    if (row.providerOrderKey) {
      const order = await provider.getOrder(row.providerOrderKey);
      if (order) orders.push(order);
    }
    if (row.status === "PENDING" && row.providerProductKey) {
      if (provider.linkIsOrder) {
        if (!row.providerOrderKey) {
          const order = await provider.getOrder(row.providerProductKey);
          if (order) orders.push(order);
        }
      } else {
        recent ??= await provider.listRecentOrders(100);
        for (const order of recent) {
          const mine = order.productKey === row.providerProductKey || order.metaPaymentId === row.id;
          if (mine && !orders.some((o) => o.orderKey === order.orderKey)) orders.push(order);
        }
      }
    }
    for (const order of orders) {
      const result = await applyProviderOrderNow(order, source);
      if (result.outcome !== "NOOP" && result.outcome !== "UNMATCHED") touched = true;
    }
  }

  const after = await prisma.tuitionInvoice.findUnique({
    where: { id: invoiceId },
    select: { status: true, refundedAmount: true },
  });
  if (!after) return { status: before.status, changed: touched };
  return {
    status: after.status,
    changed: touched || after.status !== before.status || after.refundedAmount !== before.refundedAmount,
  };
}
