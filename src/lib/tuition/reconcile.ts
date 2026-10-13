// 주기 작업 — 결제사와의 대조(15분)와 학부모 자동 안내(하루 1회).
//
// 대조는 웹훅이 빠졌거나 환불 응답을 못 받은 건을 뒤늦게 맞추는 안전망이다.
// 모든 단계가 조건부 갱신·멱등키라서 겹쳐 실행돼도, 같은 건을 두 번 처리해도 결과가 같다.

import { prisma } from "@/lib/prisma";
import { notifySlack } from "@/lib/slack";
import {
  AUTO_ISSUE_GRACE_DAYS,
  addDays,
  dateKey,
  isAutoIssueDue,
  kstDateOf,
  parseReminderDays,
  renewalReminderDay,
  unpaidReminderOffset,
} from "@/lib/tuition/calc";
import { issueInvoice } from "@/lib/tuition/invoice";
import { sendTuitionNotice } from "@/lib/tuition/notices";
import { providerCanceledAmount, type ProviderOrder } from "@/lib/tuition/provider";
import { getTuitionProvider } from "@/lib/tuition/provider-registry";
import { failRefund, processRefund } from "@/lib/tuition/refund";
import { getTuitionSetting } from "@/lib/tuition/settings";
import { applyProviderOrderNow } from "@/lib/tuition/settle";

/** 응답 없는 환불을 이 시간·횟수 넘게 확인하지 못하면 실패로 닫고 사람에게 넘긴다 */
const REFUND_GIVE_UP_MS = 24 * 60 * 60 * 1000;
const REFUND_GIVE_UP_ATTEMPTS = 3;
/** 방금 만든 환불은 요청이 아직 진행 중일 수 있다 */
const REFUND_SETTLE_DELAY_MS = 60_000;
// 주문 목록 API 가 없는 결제사(링크 = 주문)는 우리가 아는 링크를 하나씩 조회해 맞춘다.
// 결제 완료는 콜백(실패 시 24시간 동안 매시간 재전송)이 알려 주므로, 조회는 놓친 것을 줍는 안전망이다.
/** 결제 대기 중인 링크를 다시 조회하는 간격 */
const LINK_POLL_PENDING_MS = 60 * 60_000;
/** 결제된 링크를 다시 조회하는 간격 — 결제사 관리 화면에서 직접 취소한 건은 콜백이 오지 않는다 */
const LINK_POLL_PAID_MS = 24 * 60 * 60_000;
/** 결제 뒤 이 기간이 지나면 직접 취소를 더 확인하지 않는다 */
const LINK_POLL_PAID_WINDOW_MS = 45 * 24 * 60 * 60_000;
const LINK_POLL_BATCH = 100;

/** 15분 주기 — 진행 중 결제·환불을 결제사와 맞추고 기한 지난 링크를 닫는다 */
export async function runTuitionReconcile(now: Date = new Date()): Promise<{
  synced: number;
  refundsSettled: number;
  expired: number;
}> {
  // 1) 기한 지난 결제 링크 닫기 (주문이 붙은 건 = 가상계좌 입금 대기는 결제사 상태로 판단하므로 제외)
  const expired = await prisma.tuitionPayment.updateMany({
    where: { method: "LINK", status: "PENDING", providerOrderKey: null, expiresAt: { lt: now } },
    data: { status: "CANCELED", closedReason: "EXPIRED" },
  });

  const provider = getTuitionProvider();
  if (!provider) return { synced: 0, refundsSettled: 0, expired: expired.count };

  // 2) 최근 주문 중 우리 기록과 어긋난 것만 반영 (웹훅 누락, 결제사에서 직접 취소)
  let synced = 0;
  const recent = await provider.listRecentOrders(100);
  const orderKeys = recent.map((o) => o.orderKey);
  const productKeys = recent.map((o) => o.productKey).filter((k): k is string => !!k);
  const rows =
    recent.length === 0
      ? []
      : await prisma.tuitionPayment.findMany({
          where: {
            OR: [{ providerOrderKey: { in: orderKeys } }, { providerProductKey: { in: productKeys } }],
          },
          select: {
            status: true,
            refundedAmount: true,
            providerOrderKey: true,
            providerProductKey: true,
            _count: { select: { refunds: { where: { status: "PENDING" } } } },
          },
        });
  const byOrder = new Map(rows.filter((r) => r.providerOrderKey).map((r) => [r.providerOrderKey as string, r]));
  const byProduct = new Map(rows.filter((r) => r.providerProductKey).map((r) => [r.providerProductKey as string, r]));

  const needsApply = (order: ProviderOrder): boolean => {
    const bound = byOrder.get(order.orderKey);
    const linked = bound ?? (order.productKey ? byProduct.get(order.productKey) : undefined);
    if (!linked) return false; // 수강료 결제가 아니다
    if (!bound) return order.status !== "NONE"; // 우리가 아직 모르는 주문
    if (bound._count.refunds > 0) return true;
    if (order.status === "WAITING_FOR_DEPOSIT") return bound.status !== "PENDING";
    if (order.status === "NONE" || order.status === "FAILED") return bound.status === "PENDING";
    // 결제된 주문 — 완료로 잡혀 있고 환불 합계가 같으면 이미 맞다
    return !(bound.status === "DONE" && bound.refundedAmount === providerCanceledAmount(order));
  };

  for (const order of recent) {
    if (!needsApply(order)) continue;
    const result = await applyProviderOrderNow(order, "CRON");
    if (result.outcome !== "NOOP" && result.outcome !== "UNMATCHED") synced += 1;
  }

  // 2-1) 링크가 곧 주문인 결제사 — 결제 대기 중인 링크와 최근 결제된 링크를 간격을 두고 조회한다
  if (provider.linkIsOrder) {
    const polled = await prisma.tuitionPayment.findMany({
      where: {
        method: "LINK",
        providerProductKey: { not: null },
        OR: [
          {
            status: "PENDING",
            providerOrderKey: null,
            OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: new Date(now.getTime() - LINK_POLL_PENDING_MS) } }],
          },
          {
            status: "DONE",
            approvedAt: { gte: new Date(now.getTime() - LINK_POLL_PAID_WINDOW_MS) },
            // 이미 전액 돌려준 결제는 더 볼 것이 없다 (처리 중 환불은 아래 3)·4)가 맡는다)
            refunds: { none: { status: "PENDING" } },
            OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: new Date(now.getTime() - LINK_POLL_PAID_MS) } }],
          },
        ],
      },
      orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } },
      select: { id: true, status: true, paidAmount: true, refundedAmount: true, providerProductKey: true },
      take: LINK_POLL_BATCH,
    });
    const targets = polled.filter((row) => row.status === "PENDING" || row.refundedAmount < row.paidAmount);
    if (polled.length > 0) {
      // 조회 시각을 먼저 남긴다 — 결제사가 응답하지 않아도 같은 링크를 15분마다 다시 두드리지 않는다
      await prisma.tuitionPayment.updateMany({
        where: { id: { in: polled.map((row) => row.id) } },
        data: { lastSyncedAt: now },
      });
    }
    for (const row of targets) {
      try {
        const order = await provider.getOrder(row.providerProductKey as string);
        if (!order) continue;
        // 바뀐 것이 없으면(대기 중 그대로, 결제된 그대로) 반영할 것도 없다
        if (row.status === "PENDING" && order.status === "NONE") continue;
        if (row.status === "DONE" && order.status === "DONE") continue;
        const result = await applyProviderOrderNow(order, "CRON");
        if (result.outcome !== "NOOP" && result.outcome !== "UNMATCHED") synced += 1;
      } catch (error) {
        // 한 건이 실패해도 나머지는 계속 본다 — 다음 주기에 다시 조회된다
        console.error("[tuition:reconcile] 링크 조회 실패", error instanceof Error ? error.message : error);
      }
    }
  }

  // 3) 최근 목록에 없는 오래된 주문 중 아직 열려 있는 것 (입금 대기, 처리 중 환불)
  const seen = new Set(orderKeys);
  const stale = await prisma.tuitionPayment.findMany({
    where: {
      method: "LINK",
      providerOrderKey: { not: null },
      OR: [{ status: "PENDING" }, { refunds: { some: { status: "PENDING" } } }],
    },
    select: { providerOrderKey: true },
    take: 100,
  });
  for (const row of stale) {
    const key = row.providerOrderKey as string;
    if (seen.has(key)) continue;
    const order = await provider.getOrder(key);
    if (!order) continue;
    const result = await applyProviderOrderNow(order, "CRON");
    if (result.outcome !== "NOOP" && result.outcome !== "UNMATCHED") synced += 1;
  }

  // 4) 아직 처리 중인 환불 — 위에서 결제사 취소 내역은 이미 반영했으므로, 남은 건은 요청이 닿지 않은 것.
  //    같은 멱등키로 다시 보내고, 오래 확인되지 않으면 실패로 닫아 사람에게 넘긴다.
  let refundsSettled = 0;
  const pendingRefunds = await prisma.tuitionRefund.findMany({
    where: {
      status: "PENDING",
      method: "PROVIDER",
      createdAt: { lt: new Date(now.getTime() - REFUND_SETTLE_DELAY_MS) },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, createdAt: true, attemptCount: true },
    take: 50,
  });
  for (const refund of pendingRefunds) {
    const gaveUp =
      now.getTime() - refund.createdAt.getTime() > REFUND_GIVE_UP_MS &&
      refund.attemptCount >= REFUND_GIVE_UP_ATTEMPTS;
    const outcome = gaveUp
      ? await failRefund(
          refund.id,
          "UNCONFIRMED",
          "결제사에서 환불이 확인되지 않았습니다. 결제사 상점관리자에서 확인한 뒤 다시 시도해 주세요",
        )
      : await processRefund(refund.id);
    if (outcome.status === "DONE") refundsSettled += 1;
  }

  return { synced, refundsSettled, expired: expired.count };
}

/** 하루 1회 — 미납 안내·이용 종료 전 재결제 안내 (같은 날 두 번 불러도 한 번만 보낸다) */
export async function runTuitionDailyNotices(now: Date = new Date()): Promise<{ reminded: number; renewals: number }> {
  const today = kstDateOf(now);
  const todayKey = dateKey(today);

  // 미납 안내 — 납부 기한 전날·당일·3일 뒤·7일 뒤. 퇴원·졸업한 학생은 자동 안내에서 뺀다
  let reminded = 0;
  const open = await prisma.tuitionInvoice.findMany({
    where: { status: "REQUESTED", student: { status: { in: ["ACTIVE", "INACTIVE"] } } },
    select: { id: true, dueDate: true },
  });
  for (const invoice of open) {
    if (unpaidReminderOffset(invoice.dueDate, today) === null) continue;
    const result = await sendTuitionNotice({
      invoiceId: invoice.id,
      kind: "REMIND",
      dedupKey: `REMIND:${invoice.id}:${todayKey}`,
    });
    if (!result.skipped) reminded += 1;
  }

  // 재결제 안내 — 이용 종료 N일 전. 다음 청구서가 이미 나갔으면 그 청구 안내가 대신한다
  let renewals = 0;
  const reminderDays = parseReminderDays((await getTuitionSetting()).reminderDays);
  if (reminderDays.length > 0) {
    const ending = await prisma.tuitionInvoice.findMany({
      where: {
        status: { in: ["PAID", "PARTIALLY_REFUNDED"] },
        coverageEnd: { in: reminderDays.map((days) => addDays(today, days)) },
        student: {
          status: "ACTIVE",
          OR: [{ tuitionProfile: { is: null } }, { tuitionProfile: { is: { billingPaused: false } } }],
        },
      },
      select: { id: true, studentId: true, coverageEnd: true },
    });
    for (const invoice of ending) {
      const coverageEnd = invoice.coverageEnd as Date;
      const daysLeft = renewalReminderDay(coverageEnd, today, reminderDays);
      if (daysLeft === null) continue;
      const laterInvoices = await prisma.tuitionInvoice.count({
        where: { studentId: invoice.studentId, status: { not: "CANCELED" }, periodStart: { gt: coverageEnd } },
      });
      if (laterInvoices > 0) continue;
      const result = await sendTuitionNotice({
        invoiceId: invoice.id,
        kind: "RENEWAL",
        dedupKey: `RENEWAL:${invoice.id}:${daysLeft}`,
      });
      if (!result.skipped) renewals += 1;
    }
  }

  return { reminded, renewals };
}

/**
 * 하루 1회 — 자동 청구. 납부한 이용 기간이 곧 끝나는 재원생에게 다음 1개월 청구서를 발행한다 (설정이 켜져 있을 때만).
 *  · 처음 청구하는 학생은 대상이 아니다 (이용 시작일을 사람이 정해야 한다).
 *  · 선결제(여러 달)는 자동으로 만들지 않는다 — 운영진이 직접 발행한다.
 *  · 이미 다음 청구서가 있거나, 수강료가 정해지지 않았거나, 청구 제외로 둔 학생은 건너뛴다.
 * 발행은 issueInvoice 가 학생 단위로 줄을 세우고 기간 겹침을 막으므로, 겹쳐 실행돼도 한 건만 나간다.
 */
export async function runTuitionAutoIssue(now: Date = new Date()): Promise<{ issued: number; skipped: number }> {
  const setting = await getTuitionSetting();
  if (!setting.autoIssueEnabled) return { issued: 0, skipped: 0 };

  const today = kstDateOf(now);
  const ending = await prisma.tuitionInvoice.findMany({
    where: {
      status: { in: ["PAID", "PARTIALLY_REFUNDED"] },
      coverageEnd: {
        gte: addDays(today, -AUTO_ISSUE_GRACE_DAYS),
        lte: addDays(today, setting.autoIssueLeadDays),
      },
      student: { status: "ACTIVE" },
    },
    orderBy: { coverageEnd: "desc" },
    select: {
      studentId: true,
      coverageEnd: true,
      student: { select: { name: true, tuitionProfile: { select: { monthlyFee: true, billingPaused: true } } } },
    },
  });

  let issued = 0;
  let skipped = 0;
  const names: string[] = [];
  const seen = new Set<string>();
  for (const invoice of ending) {
    // 학생당 가장 늦은 이용 종료일 하나만 본다
    if (seen.has(invoice.studentId)) continue;
    seen.add(invoice.studentId);

    const coverageEnd = invoice.coverageEnd as Date;
    const profile = invoice.student.tuitionProfile;
    const monthlyFee = profile?.monthlyFee ?? setting.defaultMonthlyFee;
    if (!isAutoIssueDue(coverageEnd, today, setting.autoIssueLeadDays) || profile?.billingPaused || !monthlyFee) {
      skipped += 1;
      continue;
    }
    // 더 늦게 끝나는 납부 기간이나 아직 안 낸 청구서가 있으면 이미 다음 청구가 나간 것
    const later = await prisma.tuitionInvoice.count({
      where: {
        studentId: invoice.studentId,
        OR: [
          { status: "REQUESTED" },
          { status: { in: ["PAID", "PARTIALLY_REFUNDED"] }, coverageEnd: { gt: coverageEnd } },
        ],
      },
    });
    if (later > 0) {
      skipped += 1;
      continue;
    }

    try {
      await issueInvoice(
        {
          studentId: invoice.studentId,
          periodStart: dateKey(addDays(coverageEnd, 1)),
          months: 1,
          monthlyFee,
          dueDate: dateKey(addDays(today, setting.dueDays)),
        },
        null,
      );
      issued += 1;
      names.push(invoice.student.name);
    } catch (error) {
      // 기간 겹침(다른 실행이 먼저 발행) 등 — 다음 학생으로 넘어간다
      skipped += 1;
      console.error("[tuition:auto-issue]", error instanceof Error ? error.message : error);
    }
  }

  if (issued > 0) {
    await notifySlack(`[수강료] 자동 청구 ${issued}건 발행 — ${names.join(", ")}`);
  }
  return { issued, skipped };
}
