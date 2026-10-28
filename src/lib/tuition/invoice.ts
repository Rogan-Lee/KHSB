// 청구서 발행·취소. 호출 측이 원장급 권한을 먼저 검증한다.

import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";
import {
  calcInvoiceAmount,
  dateKey,
  MAX_PARENT_MESSAGE_LEN,
  normalizeExtraItems,
  parseDateKey,
  calendarPeriodEnd,
  daysInclusive,
  monthEndOf,
  periodEndFor,
  periodsOverlap,
  type ProratedCharge,
  type TuitionExtraItem,
} from "@/lib/tuition/calc";
import { dispatchTuitionEffects, type TuitionEffect } from "@/lib/tuition/effects";
import { recordTuitionEvent } from "@/lib/tuition/events";
import { dotDate, invoiceTitle, periodLabel, won } from "@/lib/tuition/format";
import { lockTuitionStudent, TUITION_TX } from "@/lib/tuition/lock";
import { closeLivePayments } from "@/lib/tuition/payment-rows";
import { TuitionError, type TuitionActor } from "@/lib/tuition/types";

export type IssueInvoiceInput = {
  studentId: string;
  /** 이용 시작일 YYYY-MM-DD */
  periodStart: string;
  /** 1~12. 2 이상이면 선결제 */
  months: number;
  /**
   * 첫 달 일할(달 중간 입실 등) — 있으면 이용 기간은 달력 기준(시작일이 속한 달부터 months 번째 달 말일)이고
   * 첫 달 수강료는 days × dailyRate. months 에는 일할 달도 센다 (15일 이후 입실 = 일할 + 다음 달 = 2)
   */
  prorated?: ProratedCharge | null;
  /** 월 수강료(원) */
  monthlyFee: number;
  /** 할인(원) */
  discount?: number;
  /** 납부 기한 YYYY-MM-DD */
  dueDate: string;
  /** 추가 청구 항목 (교재비 등) — 수강료에 더해진다 */
  extraItems?: TuitionExtraItem[];
  /** 학부모에게 보이는 안내 메시지 */
  parentMessage?: string | null;
  /** 운영진 메모 (학부모에게 보이지 않음) */
  memo?: string | null;
  /** 발행 안내 푸시 (기본 true) */
  notify?: boolean;
};

const MAX_MEMO_LEN = 300;
export { MAX_PARENT_MESSAGE_LEN };

/** 청구서 링크(/bill/<token>) 토큰 — 추측할 수 없는 192비트 난수 */
export function newShareToken(): string {
  return randomBytes(24).toString("base64url");
}
const MAX_REASON_LEN = 300;

/**
 * 청구서 발행. 같은 학생의 이용 기간이 겹치는 청구서가 있으면 거절한다
 * (취소된 청구서, 환불로 이용 기간이 없어진 청구서는 겹침으로 보지 않는다).
 */
export async function issueInvoice(
  input: IssueInvoiceInput,
  /** null = 자동 청구 (cron) */
  actor: TuitionActor | null,
): Promise<{ invoiceId: string }> {
  const periodStart = parseDateKey(input.periodStart);
  const dueDate = parseDateKey(input.dueDate);
  if (!periodStart) throw new TuitionError("INVALID_INPUT", "이용 시작일을 확인해 주세요");
  if (!dueDate) throw new TuitionError("INVALID_INPUT", "납부 기한을 확인해 주세요");
  const extra = normalizeExtraItems(input.extraItems);
  if (!extra.ok) throw new TuitionError("INVALID_INPUT", extra.error);
  const prorated = input.prorated ?? undefined;
  if (prorated) {
    if (periodStart.getUTCDate() === 1) throw new TuitionError("INVALID_INPUT", "1일에 시작하는 청구서는 일할로 내지 않습니다");
    if (prorated.days > daysInclusive(periodStart, monthEndOf(periodStart))) {
      throw new TuitionError("INVALID_INPUT", "일할 일수가 그달 남은 날보다 많습니다");
    }
  }
  const periodEnd = prorated ? calendarPeriodEnd(periodStart, input.months) : periodEndFor(periodStart, input.months);
  const quote = calcInvoiceAmount({
    monthlyFee: input.monthlyFee,
    months: input.months,
    discount: input.discount,
    extraItems: extra.items,
    prorated,
  });
  if (!quote.ok) throw new TuitionError("INVALID_INPUT", quote.error);
  const parentMessage = input.parentMessage?.trim() || null;
  if (parentMessage && parentMessage.length > MAX_PARENT_MESSAGE_LEN) {
    throw new TuitionError("INVALID_INPUT", `안내 메시지는 ${MAX_PARENT_MESSAGE_LEN}자 이내로 입력해 주세요`);
  }

  const title = invoiceTitle(dateKey(periodStart), dateKey(periodEnd), input.months, prorated?.days);
  const memo = input.memo?.trim().slice(0, MAX_MEMO_LEN) || null;

  const invoiceId = await prisma.$transaction(async (tx) => {
    // 같은 학생에게 두 번 발행(더블 클릭·두 관리자·일괄+개별)되지 않도록 학생 단위로 줄을 세운다
    await lockTuitionStudent(tx, input.studentId);

    const student = await tx.student.findUnique({
      where: { id: input.studentId },
      select: { id: true, status: true },
    });
    if (!student) throw new TuitionError("NOT_FOUND", "학생을 찾을 수 없습니다", 404);
    if (student.status === "WITHDRAWN" || student.status === "GRADUATED") {
      throw new TuitionError("INVALID_INPUT", "퇴원·졸업한 학생에게는 청구서를 발행할 수 없습니다");
    }

    const others = await tx.tuitionInvoice.findMany({
      where: { studentId: input.studentId, status: { not: "CANCELED" }, periodEnd: { gte: periodStart } },
      select: { status: true, periodStart: true, periodEnd: true, coverageEnd: true },
    });
    const clash = others.find((other) => {
      // 미납은 청구 기간, 납부·환불된 건은 실제 이용 기간으로 비교한다 (환불로 이용 기간이 없어졌으면 제외)
      const end = other.status === "REQUESTED" ? other.periodEnd : other.coverageEnd;
      return end !== null && periodsOverlap(periodStart, periodEnd, other.periodStart, end);
    });
    if (clash) {
      throw new TuitionError(
        "PERIOD_OVERLAP",
        `이용 기간이 겹치는 청구서가 이미 있습니다 (${periodLabel(dateKey(clash.periodStart), dateKey(clash.status === "REQUESTED" ? clash.periodEnd : (clash.coverageEnd as Date)))})`,
        409,
      );
    }

    // 과세 유형은 발행 시점 설정을 청구서에 남긴다 (나중에 설정을 바꿔도 이미 나간 청구서는 그대로)
    const setting = await tx.tuitionSetting.findUnique({ where: { id: "default" }, select: { taxType: true } });

    const created = await tx.tuitionInvoice.create({
      data: {
        studentId: input.studentId,
        title,
        periodStart,
        periodEnd,
        months: input.months,
        monthlyFee: input.monthlyFee,
        discount: quote.discount,
        extraItems: extra.items.length > 0 ? extra.items : undefined,
        amount: quote.amount,
        taxType: setting?.taxType ?? "EXEMPT",
        dueDate,
        parentMessage,
        memo,
        shareToken: newShareToken(),
        autoIssued: actor === null,
        issuedById: actor?.id ?? null,
        issuedByName: actor ? (actor.name ?? null) : "자동 청구",
      },
      select: { id: true },
    });
    await recordTuitionEvent(tx, {
      type: "INVOICE_ISSUED",
      source: actor ? "STAFF" : "CRON",
      invoiceId: created.id,
      actor,
      detail: `${title} ${won(quote.amount)} ${actor ? "청구" : "자동 청구"} · 납부 기한 ${dotDate(dateKey(dueDate))}`,
    });
    return created.id;
  }, TUITION_TX);

  if (input.notify !== false) {
    dispatchTuitionEffects([{ kind: "notice", invoiceId, noticeKind: "REQUEST" }]);
  }
  return { invoiceId };
}

/** 청구 취소 — 납부 전(결제 요청)인 청구서만. 진행 중인 결제 링크·현장 결제 신청도 함께 닫는다 */
export async function cancelInvoice(invoiceId: string, reason: string, actor: TuitionActor): Promise<void> {
  const cleanReason = reason.trim().slice(0, MAX_REASON_LEN);
  if (!cleanReason) throw new TuitionError("INVALID_INPUT", "취소 사유를 입력해 주세요");

  const found = await prisma.tuitionInvoice.findUnique({
    where: { id: invoiceId },
    select: { studentId: true },
  });
  if (!found) throw new TuitionError("NOT_FOUND", "청구서를 찾을 수 없습니다", 404);

  const effects = await prisma.$transaction(async (tx): Promise<TuitionEffect[]> => {
    await lockTuitionStudent(tx, found.studentId);

    const invoice = await tx.tuitionInvoice.findUnique({
      where: { id: invoiceId },
      select: { status: true, title: true },
    });
    if (!invoice) throw new TuitionError("NOT_FOUND", "청구서를 찾을 수 없습니다", 404);
    if (invoice.status === "CANCELED") {
      throw new TuitionError("INVOICE_NOT_PAYABLE", "이미 취소된 청구서입니다", 409);
    }
    if (invoice.status !== "REQUESTED") {
      throw new TuitionError("ALREADY_PAID", "이미 납부된 청구서는 취소할 수 없습니다. 환불로 처리해 주세요", 409);
    }

    const canceled = await tx.tuitionInvoice.updateMany({
      where: { id: invoiceId, status: "REQUESTED" },
      data: {
        status: "CANCELED",
        canceledAt: new Date(),
        canceledById: actor.id,
        canceledByName: actor.name ?? null,
        cancelReason: cleanReason,
      },
    });
    if (canceled.count !== 1) {
      throw new TuitionError("BUSY", "다른 처리가 진행 중입니다. 잠시 후 다시 시도해 주세요", 409);
    }

    const closeEffects = await closeLivePayments(tx, invoiceId, "INVOICE_CANCELED");
    await recordTuitionEvent(tx, {
      type: "INVOICE_CANCELED",
      source: "STAFF",
      invoiceId,
      actor,
      detail: `청구 취소 — ${cleanReason}`,
    });
    return closeEffects;
  }, TUITION_TX);

  dispatchTuitionEffects(effects);
}

/**
 * 취소한 청구서 삭제 — 잘못 발행했다가 바로 취소한 것처럼 돈이 오간 적 없는 건만 (결제·환불·현금영수증 기록이 하나도 없음).
 * 학부모 안내 기록(TuitionNotice)은 함께 지워지고, 진행 기록(TuitionEvent)은 남긴 채 삭제했다는 기록을 하나 더 남긴다.
 * 결제 행은 DB 에서도 청구서 삭제를 막는다(onDelete Restrict) — 확인과 삭제 사이에 끼어든 결제가 있어도 지워지지 않는다.
 */
export async function deleteCanceledInvoice(invoiceId: string, actor: TuitionActor): Promise<void> {
  const found = await prisma.tuitionInvoice.findUnique({
    where: { id: invoiceId },
    select: { studentId: true },
  });
  if (!found) throw new TuitionError("NOT_FOUND", "청구서를 찾을 수 없습니다", 404);

  await prisma.$transaction(async (tx) => {
    await lockTuitionStudent(tx, found.studentId);

    const invoice = await tx.tuitionInvoice.findUnique({
      where: { id: invoiceId },
      select: {
        status: true,
        title: true,
        amount: true,
        cancelReason: true,
        student: { select: { name: true } },
        _count: { select: { payments: true, refunds: true, cashReceipts: true } },
      },
    });
    if (!invoice) throw new TuitionError("NOT_FOUND", "청구서를 찾을 수 없습니다", 404);
    if (invoice.status !== "CANCELED") {
      throw new TuitionError("INVALID_INPUT", "취소한 청구서만 삭제할 수 있습니다", 409);
    }
    const { payments, refunds, cashReceipts } = invoice._count;
    if (payments + refunds + cashReceipts > 0) {
      throw new TuitionError("INVALID_INPUT", "결제·환불 기록이 있는 청구서는 삭제할 수 없습니다", 409);
    }

    await tx.tuitionInvoice.delete({ where: { id: invoiceId } });
    await recordTuitionEvent(tx, {
      type: "INVOICE_DELETED",
      source: "STAFF",
      invoiceId,
      actor,
      detail: `청구서 삭제 — ${invoice.student.name} · ${invoice.title} · ${won(invoice.amount)}${
        invoice.cancelReason ? ` (취소 사유: ${invoice.cancelReason})` : ""
      }`,
    });
  }, TUITION_TX);
}
