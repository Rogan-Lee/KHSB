import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { MobileApiError } from "@/lib/mobile-auth";
import { parseMobileBody, type ParentChildRef } from "@/lib/mobile-parent-services";
import { prisma } from "@/lib/prisma";
import type {
  ParentTuitionBanner,
  ParentTuitionCheckoutResponse,
  ParentTuitionFailure,
  ParentTuitionInvoice,
  ParentTuitionOnsiteResponse,
  ParentTuitionResponse,
  ParentTuitionSummary,
  ParentTuitionSyncResponse,
} from "@/lib/tuition/api-types";
import {
  addDays,
  dateKey,
  diffDays,
  invoiceDisplayStatus,
  isOverdue,
  readExtraItems,
  splitTax,
} from "@/lib/tuition/calc";
import {
  getTuitionSetting,
  isOnlinePaymentAvailable,
  requestOnsitePayment,
  startCheckout,
  syncInvoice,
  withdrawOnsiteRequest,
} from "@/lib/tuition/core";
import { PAYMENT_METHOD_LABEL } from "@/lib/tuition/format";
import { toTuitionFailure } from "@/lib/tuition/run";
import { TuitionError, type OnsiteRequestMethod } from "@/lib/tuition/types";
import { todayKST } from "@/lib/utils";

// 학부모 앱 — 수강료. 청구서 조회와 결제 시작·현장 결제 신청·결제 확인.
// 돈이 움직이는 처리는 전부 코어(@/lib/tuition/core)가 하고, 여기서는 자녀 검증이 끝난 요청을 넘기고
// 응답 모양(@/lib/tuition/api-types)을 맞추기만 한다. 취소된 청구서는 학부모에게 보여 주지 않는다.
//
// mobile-parent-services 와 서로 import 한다(전체 탭 요약 ↔ 본문 검증 헬퍼). 양쪽 다 요청을 처리할 때만
// 상대 함수를 부르므로 모듈을 읽는 순서와 무관하다 — 모듈 최상위에서 상대 값을 쓰지 말 것.

const ADMIN_TUITION_PATH = "/tuition";

/** 지난 청구서는 최근 2년치(월 납부 기준)만 내려 준다 */
const HISTORY_LIMIT = 24;

const SETTLED_STATUSES = ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] as const;
/** 이용 기간이 남아 있을 수 있는 상태 (전액 환불은 이용 기간이 없다) */
const COVERED_STATUSES = ["PAID", "PARTIALLY_REFUNDED"] as const;

// 결제 시도 행은 코어가 하나씩 만든다. 신청↔철회를 되풀이하면 그때마다 운영진 알림이 가고,
// 링크 생성이 계속 실패하면 결제사 호출이 쌓이므로 자녀별 하루 횟수를 막아 둔다 (정상 이용은 1~2회).
const ONSITE_DAILY_LIMIT = 10;
const CHECKOUT_DAILY_LIMIT = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

const idField = (message: string) => z.string({ message }).trim().min(1, message).max(64, message);
const BAD_BODY = { message: "요청 형식을 확인하세요" };

const invoiceSchema = z.object({ invoiceId: idField("청구서를 확인해 주세요") }, BAD_BODY);

const onsiteSchema = z.object(
  {
    invoiceId: idField("청구서를 확인해 주세요"),
    method: z.enum(["LOCAL_CURRENCY", "ONSITE_CARD"], { message: "결제 방법을 골라 주세요" }),
  },
  BAD_BODY,
);

const withdrawSchema = z.object({ paymentId: idField("신청 내역을 확인해 주세요") }, BAD_BODY);

// ─── 조회 ─────────────────────────────────────────────────────────────

// 닫힌 결제 시도(CANCELED · FAILED)는 화면에 쓰지 않으므로 읽지 않는다.
// 납부로 확정된 결제는 paidPaymentId 로 고른다 — 중복 결제(isDuplicate)도 DONE 이라 상태만으로는 구분되지 않는다.
const invoiceSelect = {
  id: true,
  title: true,
  periodStart: true,
  periodEnd: true,
  months: true,
  monthlyFee: true,
  discount: true,
  extraItems: true,
  amount: true,
  taxType: true,
  parentMessage: true,
  dueDate: true,
  status: true,
  paidAt: true,
  paidPaymentId: true,
  refundedAmount: true,
  coverageEnd: true,
  payments: {
    where: { status: { in: ["PENDING", "ONSITE_REQUESTED", "DONE"] } },
    select: {
      id: true,
      method: true,
      status: true,
      isDuplicate: true,
      providerMethod: true,
      receiptUrl: true,
      checkoutStartedAt: true,
      depositBank: true,
      depositAccount: true,
      depositDueAt: true,
      requestedAt: true,
      createdAt: true,
    },
  },
  refunds: {
    orderBy: { createdAt: "desc" },
    select: { paymentId: true, amount: true, status: true, completedAt: true, createdAt: true },
  },
} satisfies Prisma.TuitionInvoiceSelect;

type InvoiceRow = Prisma.TuitionInvoiceGetPayload<{ select: typeof invoiceSelect }>;
type PaymentRow = InvoiceRow["payments"][number];

const isOnsiteMethod = (method: PaymentRow["method"]): method is OnsiteRequestMethod =>
  method === "LOCAL_CURRENCY" || method === "ONSITE_CARD";

function newest<T>(rows: T[], at: (row: T) => Date): T | null {
  return rows.reduce<T | null>(
    (best, row) => (best === null || at(row).getTime() > at(best).getTime() ? row : best),
    null,
  );
}

function paidMethodLabel(payment: PaymentRow): string {
  if (payment.method !== "LINK") return PAYMENT_METHOD_LABEL[payment.method];
  return `${PAYMENT_METHOD_LABEL.LINK}${payment.providerMethod ? `(${payment.providerMethod})` : ""}`;
}

function toParentInvoice(row: InvoiceRow, today: Date): ParentTuitionInvoice {
  const paid = row.paidPaymentId
    ? (row.payments.find((p) => p.id === row.paidPaymentId) ?? null)
    : null;

  // 진행 중 안내(현장 신청·결제 미완료·입금 대기)는 아직 결제할 청구서에만 붙인다.
  // 납부가 끝난 청구서에 남아 있는 대기 행은 코어가 닫을 대상이라 학부모에게 보여 줄 내용이 아니다.
  // 납부로 인정되지 않은 결제(isDuplicate)도 자동 환불 대상이므로 안내하지 않는다.
  const waiting = row.status === "REQUESTED" ? row.payments.filter((p) => !p.isDuplicate) : [];

  const onsite = newest(
    waiting.filter((p) => p.status === "ONSITE_REQUESTED" && isOnsiteMethod(p.method)),
    (p) => p.requestedAt ?? p.createdAt,
  );

  // 결제 링크를 받아 두기만 한 것은 "결제 미완료"가 아니다 — 결제창을 열었거나 가상계좌를 받은 경우만.
  const openedLinks = waiting.filter(
    (p) => p.status === "PENDING" && p.method === "LINK" && (p.checkoutStartedAt || p.depositAccount),
  );
  const link =
    newest(
      openedLinks.filter((p) => p.depositAccount),
      (p) => p.createdAt,
    ) ?? newest(openedLinks, (p) => p.checkoutStartedAt ?? p.createdAt);

  return {
    id: row.id,
    title: row.title,
    periodStart: dateKey(row.periodStart),
    periodEnd: dateKey(row.periodEnd),
    months: row.months,
    amount: row.amount,
    breakdown: {
      monthlyFee: row.monthlyFee,
      tuition: row.monthlyFee * row.months,
      extraItems: readExtraItems(row.extraItems),
      discount: row.discount,
    },
    tax: row.taxType === "TAXABLE" ? splitTax(row.amount, "TAXABLE") : null,
    message: row.parentMessage,
    dueDate: dateKey(row.dueDate),
    status: invoiceDisplayStatus(row, today),
    daysToDue: diffDays(today, row.dueDate),
    paidAt: row.paidAt?.toISOString() ?? null,
    paidMethodLabel: paid ? paidMethodLabel(paid) : null,
    receiptUrl: paid?.receiptUrl ?? null,
    refundedAmount: row.refundedAmount,
    coverageEnd: row.coverageEnd ? dateKey(row.coverageEnd) : null,
    onsiteRequest:
      onsite && isOnsiteMethod(onsite.method)
        ? {
            paymentId: onsite.id,
            method: onsite.method,
            requestedAt: (onsite.requestedAt ?? onsite.createdAt).toISOString(),
          }
        : null,
    linkPending: link
      ? {
          startedAt: link.checkoutStartedAt?.toISOString() ?? null,
          deposit: link.depositAccount
            ? {
                bank: link.depositBank,
                accountNumber: link.depositAccount,
                dueAt: link.depositDueAt?.toISOString() ?? null,
              }
            : null,
        }
      : null,
    // 중복·오결제의 자동 환불은 다른 결제 행에 달려 있다 — 이 청구서의 환불로 보이면 안 된다.
    refunds: row.refunds
      .filter((r) => r.paymentId === row.paidPaymentId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((r) => ({
        amount: r.amount,
        status: r.status,
        completedAt: r.completedAt?.toISOString() ?? null,
      })),
  };
}

function nextPaymentOf(
  open: ParentTuitionInvoice[],
  coverageEnd: Date | null,
): ParentTuitionResponse["nextPayment"] {
  const coverageKey = coverageEnd ? dateKey(coverageEnd) : null;
  if (open.length > 0) return { basis: "DUE", date: open[0].dueDate, coverageEnd: coverageKey };
  if (coverageEnd) {
    return { basis: "COVERAGE_END", date: dateKey(addDays(coverageEnd, 1)), coverageEnd: coverageKey };
  }
  return { basis: "NONE", date: null, coverageEnd: null };
}

export async function getParentTuition(child: ParentChildRef): Promise<ParentTuitionResponse> {
  const today = todayKST();

  const [openRows, settledRows, coverage, setting, onlinePaymentEnabled] = await Promise.all([
    prisma.tuitionInvoice.findMany({
      where: { studentId: child.id, status: "REQUESTED" },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      select: invoiceSelect,
    }),
    prisma.tuitionInvoice.findMany({
      where: { studentId: child.id, status: { in: [...SETTLED_STATUSES] } },
      orderBy: [{ paidAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: HISTORY_LIMIT,
      select: invoiceSelect,
    }),
    // 다음 결제 안내 기준 — 목록은 24건으로 자르지만 이용 종료일은 전체에서 가장 늦은 날이어야 한다
    prisma.tuitionInvoice.aggregate({
      where: { studentId: child.id, status: { in: [...COVERED_STATUSES] } },
      _max: { coverageEnd: true },
    }),
    getTuitionSetting(),
    isOnlinePaymentAvailable(),
  ]);

  const open = [...openRows]
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .map((row) => toParentInvoice(row, today));
  const history = [...settledRows]
    .sort((a, b) => (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0))
    .map((row) => toParentInvoice(row, today));

  return {
    studentName: child.name,
    onlinePaymentEnabled,
    guideText: setting.guideText,
    onsiteGuideText: setting.onsiteGuideText,
    open,
    nextPayment: nextPaymentOf(open, coverage._max.coverageEnd ?? null),
    history,
  };
}

// ─── 홈 배너 · 전체 탭 요약 · 배지 (기존 응답에 덧붙이는 값) ─────────────

export type OpenTuition = {
  invoiceId: string;
  title: string;
  amount: number;
  /** YYYY-MM-DD */
  dueDate: string;
  overdue: boolean;
  /** 확인 대기 중인 현장 결제 신청이 있음 */
  onsiteRequested: boolean;
};

/** 자녀별 결제할 청구서 (납부 기한이 빠른 순). 청구서가 없는 자녀는 Map 에 없다 */
export async function getOpenTuitionByStudent(studentIds: string[]): Promise<Map<string, OpenTuition[]>> {
  const byStudent = new Map<string, OpenTuition[]>();
  if (studentIds.length === 0) return byStudent;

  const today = todayKST();
  const rows = await prisma.tuitionInvoice.findMany({
    where: { studentId: { in: studentIds }, status: "REQUESTED" },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      studentId: true,
      title: true,
      amount: true,
      dueDate: true,
      status: true,
      _count: { select: { payments: { where: { status: "ONSITE_REQUESTED" } } } },
    },
  });

  for (const row of [...rows].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())) {
    const list = byStudent.get(row.studentId) ?? [];
    list.push({
      invoiceId: row.id,
      title: row.title,
      amount: row.amount,
      dueDate: dateKey(row.dueDate),
      overdue: isOverdue(row, today),
      onsiteRequested: row._count.payments > 0,
    });
    byStudent.set(row.studentId, list);
  }
  return byStudent;
}

/** 홈 배너 — 납부 기한이 가장 빠른 청구서 */
export function tuitionBannerOf(open: OpenTuition[] | undefined): ParentTuitionBanner {
  const first = open?.[0];
  if (!first) return null;
  return {
    invoiceId: first.invoiceId,
    title: first.title,
    amount: first.amount,
    dueDate: first.dueDate,
    overdue: first.overdue,
  };
}

/** 전체 탭 요약 값 — 미납 > 현장 결제 확인 대기 > 결제 요청 > 납부(이용 중) > 없음 */
export function tuitionSummaryOf(open: OpenTuition[], hasActiveCoverage: boolean): ParentTuitionSummary {
  if (open.some((invoice) => invoice.overdue)) return "overdue";
  if (open.some((invoice) => invoice.onsiteRequested)) return "onsite";
  if (open.length > 0) return "unpaid";
  return hasActiveCoverage ? "paid" : "none";
}

export async function getParentTuitionSummary(studentId: string): Promise<ParentTuitionSummary> {
  const open = (await getOpenTuitionByStudent([studentId])).get(studentId) ?? [];
  if (open.length > 0) return tuitionSummaryOf(open, false);

  const covered = await prisma.tuitionInvoice.count({
    where: {
      studentId,
      status: { in: [...COVERED_STATUSES] },
      coverageEnd: { gte: todayKST() },
    },
  });
  return tuitionSummaryOf(open, covered > 0);
}

/** 학부모 배지 — 자녀 전체의 결제할 청구서 수 */
export function countOpenTuitionInvoices(studentIds: string[]): Promise<number> {
  if (studentIds.length === 0) return Promise.resolve(0);
  return prisma.tuitionInvoice.count({
    where: { studentId: { in: studentIds }, status: "REQUESTED" },
  });
}

// ─── 결제 시작 · 현장 결제 신청 · 결제 확인 ─────────────────────────────

/**
 * 코어 호출을 앱 응답으로 바꾼다. 이미 납부됨·온라인 결제 미사용처럼 앱이 갈라서 보여 줘야 하는
 * 업무 결과는 HTTP 200 + ok:false 로 주고(앱은 HTTP 오류에서 메시지만 남긴다), 예상하지 못한 오류는
 * 그대로 던져 라우트의 mobileApiErrorResponse 가 500 으로 처리하게 한다.
 */
async function asTuitionOutcome<T extends { ok: true }>(fn: () => Promise<T>): Promise<T | ParentTuitionFailure> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof MobileApiError) throw error;
    const failure = toTuitionFailure(error);
    if (failure.code === "INTERNAL" && !(error instanceof TuitionError)) throw error;
    return { ok: false, code: failure.code, message: failure.error };
  }
}

async function assertDailyAttempts(
  child: ParentChildRef,
  methods: PaymentRow["method"][],
  limit: number,
  message: string,
) {
  const recent = await prisma.tuitionPayment.count({
    where: {
      invoice: { studentId: child.id },
      method: { in: methods },
      createdAt: { gte: new Date(Date.now() - DAY_MS) },
    },
  });
  if (recent >= limit) throw new MobileApiError(message, 429);
}

/** 결제하기 — 결제 링크를 받아 앱 안 브라우저로 연다. baseUrl 은 모의 결제 페이지 주소용 */
export async function startParentTuitionCheckout(
  authUserId: string,
  child: ParentChildRef,
  input: unknown,
  baseUrl: string,
): Promise<ParentTuitionCheckoutResponse> {
  const body = parseMobileBody(invoiceSchema, input);
  await assertDailyAttempts(
    child,
    ["LINK"],
    CHECKOUT_DAILY_LIMIT,
    "결제 시도가 너무 많아요. 잠시 후 다시 시도하거나 독서실로 문의해 주세요",
  );

  return asTuitionOutcome(async () => {
    const result = await startCheckout({
      invoiceId: body.invoiceId,
      studentId: child.id,
      authUserId,
      baseUrl,
    });
    revalidatePath(ADMIN_TUITION_PATH);
    return { ok: true as const, ...result };
  });
}

/** 현장 결제(지역화폐·카드 단말기) 신청 — 운영진이 단말기 결제 뒤 확인한다 */
export async function requestParentTuitionOnsite(
  authUserId: string,
  child: ParentChildRef,
  input: unknown,
): Promise<ParentTuitionOnsiteResponse> {
  const body = parseMobileBody(onsiteSchema, input);
  await assertDailyAttempts(
    child,
    ["LOCAL_CURRENCY", "ONSITE_CARD"],
    ONSITE_DAILY_LIMIT,
    "오늘은 현장 결제 신청을 더 할 수 없어요. 독서실로 문의해 주세요",
  );

  return asTuitionOutcome(async () => {
    const result = await requestOnsitePayment({
      invoiceId: body.invoiceId,
      studentId: child.id,
      authUserId,
      method: body.method,
    });
    revalidatePath(ADMIN_TUITION_PATH);
    return { ok: true as const, paymentId: result.paymentId };
  });
}

export type ParentTuitionWithdrawResponse = { ok: true } | ParentTuitionFailure;

/** 현장 결제 신청 철회 */
export async function withdrawParentTuitionOnsite(
  authUserId: string,
  child: ParentChildRef,
  input: unknown,
): Promise<ParentTuitionWithdrawResponse> {
  const body = parseMobileBody(withdrawSchema, input);

  return asTuitionOutcome(async () => {
    await withdrawOnsiteRequest({ paymentId: body.paymentId, studentId: child.id, authUserId });
    revalidatePath(ADMIN_TUITION_PATH);
    return { ok: true as const };
  });
}

/**
 * 결제 확인 — 결제창에서 돌아온 앱이 부른다 (웹훅이 늦거나 빠졌을 때 결제사에 다시 물어 반영).
 * 결제사 재조회 간격은 코어가 제한한다.
 */
export async function syncParentTuition(
  child: ParentChildRef,
  input: unknown,
): Promise<ParentTuitionSyncResponse> {
  const body = parseMobileBody(invoiceSchema, input);

  // syncInvoice 는 소유자를 보지 않는다 — 남의 자녀 청구서로 결제사 조회를 일으키지 못하게 먼저 확인
  const invoice = await prisma.tuitionInvoice.findFirst({
    where: { id: body.invoiceId, studentId: child.id },
    select: { id: true, dueDate: true },
  });
  if (!invoice) throw new MobileApiError("청구서를 찾을 수 없습니다", 404);

  return asTuitionOutcome(async () => {
    const { status, changed } = await syncInvoice(invoice.id, "SYNC");
    if (changed) revalidatePath(ADMIN_TUITION_PATH);
    const display = invoiceDisplayStatus({ status, dueDate: invoice.dueDate }, todayKST());
    return {
      ok: true as const,
      status: display,
      settled: display !== "REQUESTED" && display !== "OVERDUE",
    };
  });
}
