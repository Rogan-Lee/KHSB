"use server";

// 수강료 어드민 서버 액션. 이 파일의 export 는 전부 공개 엔드포인트다.
//  · 모든 export 는 맨 먼저 세션·역할을 확인한다. 권한 오류는 다른 액션과 같이 throw(Unauthorized/Forbidden),
//    업무 결과는 TuitionResult 로 돌려준다 (운영 빌드에서 throw 한 문구는 가려지기 때문).
//  · 조회·현장 결제 확인·현금영수증 신청 등록·청구서 링크·상태 새로고침 = 직원 전체,
//    발행·취소·환불·안내 발송·현금영수증 발급 처리·내보내기·설정 = 원장급.
//  · 돈이 움직이는 처리는 전부 코어(@/lib/tuition/core)가 한다. 여기서는 입력을 다시 검증해 넘기기만 한다
//    (클라이언트가 보낸 값은 타입이 맞는다는 보장이 없다).

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isFullAccess, requireFullAccess, requireStaff } from "@/lib/roles";
import { getTuitionInvoiceDetail, type AdminInvoiceDetail } from "@/lib/tuition/admin-data";
import {
  MAX_INVOICE_AMOUNT,
  MAX_INVOICE_MONTHS,
  MAX_PARENT_MESSAGE_LEN,
  normalizeCashReceiptIdentifier,
  normalizeExtraItems,
  parseDateKey,
  parseReminderDays,
} from "@/lib/tuition/calc";
import {
  billUrl,
  cancelCashReceipt,
  cancelInvoice,
  confirmOnsitePayment,
  dismissOnsiteRequest,
  ensureBillToken,
  getTuitionExport,
  getTuitionProviderBalance,
  issueInvoice,
  markCashReceiptIssued,
  requestCashReceipt,
  requestRefund,
  sendInvoiceTalk,
  sendTuitionNotices,
  syncInvoice,
  type IssueInvoiceInput,
  type RefundOutcome,
  type RequestRefundInput,
  type TuitionSettingValues,
} from "@/lib/tuition/core";
import { devRequestOrigin } from "@/lib/tuition/dev-origin";
import { ProviderError } from "@/lib/tuition/provider";
import { runTuition } from "@/lib/tuition/run";
import {
  TuitionError,
  type OnsiteConfirmMethod,
  type TuitionActor,
  type TuitionErrorCode,
  type TuitionRefundAccount,
  type TuitionResult,
} from "@/lib/tuition/types";

const ISSUE_BATCH_MAX = 200;
const REMINDER_BATCH_MAX = 200;
/** 알림톡 청구서는 한 건씩 결제사를 부른다 — 한 번에 너무 많이 보내지 않게 한다 */
const TALK_BATCH_MAX = 100;
const REASON_MAX = 300;
const MEMO_MAX = 300;
const CALC_BASIS_MAX = 300;
const GUIDE_TEXT_MAX = 5000;
const SETTING_DAYS_MAX = 60;
const AUTO_ISSUE_LEAD_DAYS_MAX = 30;
const MIN_MONTHLY_FEE = 1_000;

const ONSITE_CONFIRM_METHODS: readonly OnsiteConfirmMethod[] = ["LOCAL_CURRENCY", "ONSITE_CARD", "CASH", "TRANSFER"];
const REFUND_POLICIES: readonly TuitionSettingValues["refundPolicy"][] = ["DAILY", "ACADEMY_LAW", "MANUAL"];
const TAX_TYPES: readonly TuitionSettingValues["taxType"][] = ["EXEMPT", "TAXABLE"];
const CASH_METHODS: readonly OnsiteConfirmMethod[] = ["CASH", "TRANSFER"];

export type TuitionCashReceiptInput = { purpose: "INCOME" | "EXPENSE"; identifier: string };

export type IssueTuitionItemResult = {
  studentId: string;
  ok: boolean;
  invoiceId?: string;
  code?: TuitionErrorCode;
  error?: string;
};

export type TuitionReminderResult = { invoiceId: string; studentName: string; sent: number };

export type TuitionTalkResult = {
  invoiceId: string;
  studentName: string;
  ok: boolean;
  /** 이미 보낸 청구서를 다시 보낸 경우 */
  resent?: boolean;
  error?: string;
};

export type TuitionSettingInput = {
  defaultMonthlyFee: number | null;
  dueDays: number;
  leadDays: number;
  reminderDays: string;
  refundPolicy: TuitionSettingValues["refundPolicy"];
  onlinePaymentEnabled: boolean;
  taxType: TuitionSettingValues["taxType"];
  autoIssueEnabled: boolean;
  autoIssueLeadDays: number;
  guideText: string | null;
  onsiteGuideText: string | null;
};

export type TuitionProfileInput = {
  studentId: string;
  monthlyFee: number | null;
  billingPaused: boolean;
  memo?: string | null;
};

// ─── 인증 ──────────────────────────────────────────────────────────────

async function requireStaffSession(): Promise<{ actor: TuitionActor; fullAccess: boolean }> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireStaff(session.user.role);
  return {
    actor: { id: session.user.id, name: session.user.name ?? null },
    fullAccess: isFullAccess(session.user.role),
  };
}

async function requireStaffActor(): Promise<TuitionActor> {
  return (await requireStaffSession()).actor;
}

async function requireFullAccessActor(): Promise<TuitionActor> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireFullAccess(session.user.role);
  return { id: session.user.id, name: session.user.name ?? null };
}

// ─── 입력 검증 ─────────────────────────────────────────────────────────
// 오류 문구는 화면에 그대로 보인다 (TuitionError.message).

function invalid(message: string): never {
  throw new TuitionError("INVALID_INPUT", message);
}

/** cuid 형태의 id — 문자열이고 64자 이하 */
function parseId(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) invalid(`${label} 정보가 올바르지 않습니다`);
  return value as string;
}

function parseRequiredText(value: unknown, label: string, max: number, emptyMessage: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) invalid(emptyMessage);
  if (text.length > max) invalid(`${label} 항목은 ${max}자 이내로 입력해 주세요`);
  return text;
}

/** 비어 있으면 null */
function parseOptionalText(value: unknown, label: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") invalid(`${label} 항목을 확인해 주세요`);
  const text = (value as string).trim();
  if (text.length > max) invalid(`${label} 항목은 ${max}자 이내로 입력해 주세요`);
  return text || null;
}

function parseInteger(value: unknown, min: number, max: number, message: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) invalid(message);
  return value as number;
}

function parseDate(value: unknown, message: string): string {
  if (typeof value !== "string" || !parseDateKey(value)) invalid(message);
  return value as string;
}

function parseIdList(value: unknown, label: string, max: number): string[] {
  if (!Array.isArray(value) || value.length === 0) invalid(`${label}를 선택해 주세요`);
  const list = value as unknown[];
  if (list.length > max) invalid(`한 번에 ${max}건까지 처리할 수 있습니다`);
  return [...new Set(list.map((item) => parseId(item, label)))];
}

/** null(미설정) 또는 1,000원 이상 정수 */
function parseMonthlyFeeOrNull(value: unknown, label: string): number | null {
  if (value === null || value === undefined) return null;
  return parseInteger(
    value,
    MIN_MONTHLY_FEE,
    MAX_INVOICE_AMOUNT,
    `${label}는 ${MIN_MONTHLY_FEE.toLocaleString("ko-KR")}원 이상으로 입력해 주세요`,
  );
}

/** 현금영수증 신청 정보 — 구분과 번호 형식을 본다 (번호는 숫자만 남긴다) */
function parseCashReceipt(raw: unknown): TuitionCashReceiptInput {
  if (typeof raw !== "object" || raw === null) invalid("현금영수증 정보를 확인해 주세요");
  const input = raw as Record<string, unknown>;
  if (input.purpose !== "INCOME" && input.purpose !== "EXPENSE") invalid("현금영수증 발급 구분을 선택해 주세요");
  const purpose = input.purpose as TuitionCashReceiptInput["purpose"];
  const parsed = normalizeCashReceiptIdentifier(purpose, typeof input.identifier === "string" ? input.identifier : "");
  if (!parsed.ok) invalid(parsed.error);
  return { purpose, identifier: parsed.identifier };
}

function parseIssueItem(raw: unknown): IssueInvoiceInput {
  if (typeof raw !== "object" || raw === null) invalid("청구 내용을 확인해 주세요");
  const item = raw as Record<string, unknown>;
  const extra = normalizeExtraItems(item.extraItems);
  if (!extra.ok) invalid(extra.error);
  return {
    studentId: parseId(item.studentId, "학생"),
    periodStart: parseDate(item.periodStart, "이용 시작일을 확인해 주세요"),
    months: parseInteger(item.months, 1, MAX_INVOICE_MONTHS, `개월 수는 1~${MAX_INVOICE_MONTHS} 사이여야 합니다`),
    monthlyFee: parseInteger(item.monthlyFee, 1, MAX_INVOICE_AMOUNT, "월 수강료를 확인해 주세요"),
    discount:
      item.discount === undefined ? 0 : parseInteger(item.discount, 0, MAX_INVOICE_AMOUNT, "할인 금액을 확인해 주세요"),
    dueDate: parseDate(item.dueDate, "납부 기한을 확인해 주세요"),
    extraItems: extra.items,
    parentMessage: parseOptionalText(item.parentMessage, "안내 메시지", MAX_PARENT_MESSAGE_LEN),
    memo: parseOptionalText(item.memo, "메모", MEMO_MAX),
    notify: item.notify !== false,
  };
}

function parseRefundAccount(raw: unknown): TuitionRefundAccount | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object") invalid("환불 계좌를 확인해 주세요");
  const account = raw as Record<string, unknown>;
  const accountNumber = parseRequiredText(account.accountNumber, "환불 계좌번호", 30, "환불 계좌번호를 입력해 주세요").replace(
    /[\s-]/g,
    "",
  );
  if (!/^\d{6,20}$/.test(accountNumber)) invalid("환불 계좌번호를 확인해 주세요");
  return {
    bank: parseRequiredText(account.bank, "환불 은행", 30, "환불받을 은행을 입력해 주세요"),
    accountNumber,
    holderName: parseRequiredText(account.holderName, "예금주", 30, "예금주를 입력해 주세요"),
  };
}

function parseRefundInput(raw: unknown): RequestRefundInput {
  if (typeof raw !== "object" || raw === null) invalid("환불 내용을 확인해 주세요");
  const input = raw as Record<string, unknown>;
  const parsed: RequestRefundInput = {
    invoiceId: parseId(input.invoiceId, "청구서"),
    amount: parseInteger(input.amount, 1, MAX_INVOICE_AMOUNT, "환불 금액을 확인해 주세요"),
    reason: parseRequiredText(input.reason, "환불 사유", REASON_MAX, "환불 사유를 입력해 주세요"),
    calcBasis: parseOptionalText(input.calcBasis, "계산 근거", CALC_BASIS_MAX),
    manualConfirmed: input.manualConfirmed === true,
  };
  if (input.paymentId !== undefined && input.paymentId !== null) parsed.paymentId = parseId(input.paymentId, "결제");
  // 생략(이용 기간 유지)과 null(이용 전 환불)은 뜻이 다르다 — 그대로 구분해 넘긴다
  if (input.lastUsedDate === null) parsed.lastUsedDate = null;
  else if (input.lastUsedDate !== undefined) {
    parsed.lastUsedDate = parseDate(input.lastUsedDate, "마지막 이용일을 확인해 주세요");
  }
  const refundAccount = parseRefundAccount(input.refundAccount);
  if (refundAccount) parsed.refundAccount = refundAccount;
  return parsed;
}

/** "7, 3" → "7,3". 0~60 사이 정수가 아닌 값이 섞여 있으면 거절한다 (비우면 재결제 안내를 보내지 않는다) */
function parseReminderDaysText(value: unknown): string {
  if (typeof value !== "string") invalid("재결제 안내 시점을 확인해 주세요");
  const tokens = (value as string)
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length > 10) invalid("재결제 안내 시점은 10개까지 정할 수 있습니다");
  if (tokens.some((token) => !/^\d{1,2}$/.test(token) || Number(token) > SETTING_DAYS_MAX)) {
    invalid(`재결제 안내 시점은 0~${SETTING_DAYS_MAX} 사이 숫자를 쉼표로 구분해 입력해 주세요`);
  }
  return parseReminderDays(tokens.join(",")).join(",");
}

// ─── 발행 · 취소 (원장급) ───────────────────────────────────────────────

/**
 * 청구서 여러 건 발행. 한 건씩 따로 처리하므로 일부만 실패할 수 있다 —
 * 건별 결과를 돌려주어 화면이 어떤 학생이 왜 실패했는지 보여 준다.
 */
export async function issueTuitionInvoices(
  items: IssueInvoiceInput[],
): Promise<TuitionResult<{ results: IssueTuitionItemResult[]; issued: number; failed: number }>> {
  const actor = await requireFullAccessActor();
  const result = await runTuition(async () => {
    if (!Array.isArray(items) || items.length === 0) invalid("발행할 청구서를 선택해 주세요");
    if (items.length > ISSUE_BATCH_MAX) invalid(`한 번에 ${ISSUE_BATCH_MAX}건까지 발행할 수 있습니다`);

    const results: IssueTuitionItemResult[] = [];
    for (const raw of items) {
      const rawStudentId = (raw as { studentId?: unknown } | null)?.studentId;
      const studentId = typeof rawStudentId === "string" ? rawStudentId.slice(0, 64) : "";
      // 건마다 코어를 따로 부른다 (학생 단위 락 · 트랜잭션도 건마다)
      const issued = await runTuition(() => issueInvoice(parseIssueItem(raw), actor));
      results.push(
        issued.ok
          ? { studentId, ok: true, invoiceId: issued.data.invoiceId }
          : { studentId, ok: false, code: issued.code, error: issued.error },
      );
    }
    const issued = results.filter((r) => r.ok).length;
    return { results, issued, failed: results.length - issued };
  });
  revalidatePath("/tuition");
  return result;
}

export async function cancelTuitionInvoice(invoiceId: string, reason: string): Promise<TuitionResult> {
  const actor = await requireFullAccessActor();
  const result = await runTuition(() =>
    cancelInvoice(
      parseId(invoiceId, "청구서"),
      parseRequiredText(reason, "취소 사유", REASON_MAX, "취소 사유를 입력해 주세요"),
      actor,
    ),
  );
  revalidatePath("/tuition");
  return result;
}

// ─── 현장 결제 (직원 전체) ───────────────────────────────────────────────

/**
 * 현장 결제 확인 — paymentId 가 있으면 학부모 신청 건을, 없으면 신청 없이 방문 결제한 건을 기록한다.
 * 현금·계좌이체면 현금영수증 신청 정보를 같이 등록할 수 있다. 납부 처리는 됐는데 현금영수증 등록만
 * 실패하면 ok 로 돌려주고 cashReceiptError 에 사유를 담는다 (납부를 되돌리지 않는다).
 */
export async function confirmTuitionOnsitePayment(input: {
  invoiceId: string;
  paymentId?: string;
  method: OnsiteConfirmMethod;
  memo?: string | null;
  /** 단말기 승인번호 (카드·지역화폐) */
  approvalNumber?: string | null;
  cashReceipt?: TuitionCashReceiptInput | null;
}): Promise<TuitionResult<{ paymentId: string; cashReceiptError?: string }>> {
  const actor = await requireStaffActor();
  const result = await runTuition(async () => {
    if (typeof input !== "object" || input === null) invalid("결제 내용을 확인해 주세요");
    if (!ONSITE_CONFIRM_METHODS.includes(input.method)) invalid("결제 수단을 선택해 주세요");
    // 번호 형식은 납부 처리 전에 본다 — 잘못된 번호 때문에 납부만 되고 등록이 빠지는 일이 없게
    const cashReceipt =
      input.cashReceipt === undefined || input.cashReceipt === null ? null : parseCashReceipt(input.cashReceipt);
    if (cashReceipt && !CASH_METHODS.includes(input.method)) {
      invalid("현금영수증은 현금·계좌이체 수납에만 등록할 수 있습니다");
    }
    const confirmed = await confirmOnsitePayment(
      {
        invoiceId: parseId(input.invoiceId, "청구서"),
        ...(input.paymentId !== undefined && input.paymentId !== null
          ? { paymentId: parseId(input.paymentId, "결제") }
          : {}),
        method: input.method,
        memo: parseOptionalText(input.memo, "메모", MEMO_MAX),
        approvalNumber: parseOptionalText(input.approvalNumber, "승인번호", 30),
      },
      actor,
    );
    if (!cashReceipt) return confirmed;
    const registered = await runTuition(() =>
      requestCashReceipt({ paymentId: confirmed.paymentId, ...cashReceipt }, actor),
    );
    return registered.ok ? confirmed : { ...confirmed, cashReceiptError: registered.error };
  });
  revalidatePath("/tuition");
  return result;
}

export async function dismissTuitionOnsiteRequest(paymentId: string): Promise<TuitionResult> {
  const actor = await requireStaffActor();
  const result = await runTuition(() => dismissOnsiteRequest(parseId(paymentId, "결제"), actor));
  revalidatePath("/tuition");
  return result;
}

// ─── 환불 (원장급) ─────────────────────────────────────────────────────

export async function refundTuition(
  input: RequestRefundInput,
): Promise<TuitionResult<{ refundId: string } & RefundOutcome>> {
  const actor = await requireFullAccessActor();
  const result = await runTuition(() => requestRefund(parseRefundInput(input), actor));
  revalidatePath("/tuition");
  return result;
}

// ─── 안내 (원장급) ─────────────────────────────────────────────────────

/** 청구·미납 안내 발송. sent 는 푸시가 도달한 기기 수 — 0 이면 앱 미설치·알림 꺼짐이라 직접 전달해야 한다 */
export async function sendTuitionReminders(
  invoiceIds: string[],
  kind: "REQUEST" | "REMIND",
): Promise<TuitionResult<TuitionReminderResult[]>> {
  const actor = await requireFullAccessActor();
  const result = await runTuition(async () => {
    if (kind !== "REQUEST" && kind !== "REMIND") invalid("안내 종류를 확인해 주세요");
    const ids = parseIdList(invoiceIds, "청구서", REMINDER_BATCH_MAX);
    const sent = await sendTuitionNotices(ids, kind, actor);
    return sent.map((row) => ({ invoiceId: row.invoiceId, studentName: row.studentName, sent: row.sent }));
  });
  revalidatePath("/tuition");
  return result;
}

/**
 * 결제사 알림 청구서 발송 — 결제사(결제선생)가 학부모 휴대폰으로 카카오 알림톡 청구서를 보낸다.
 * 보낼 때마다 결제사 포인트가 차감된다. 한 건씩 따로 처리하므로 일부만 실패할 수 있다.
 */
export async function sendTuitionBillTalk(
  invoiceIds: string[],
): Promise<TuitionResult<{ results: TuitionTalkResult[]; sent: number; failed: number }>> {
  const actor = await requireFullAccessActor();
  const result = await runTuition(async () => {
    const ids = parseIdList(invoiceIds, "청구서", TALK_BATCH_MAX);
    const baseUrl = await devRequestOrigin();
    const names = new Map(
      (
        await prisma.tuitionInvoice.findMany({
          where: { id: { in: ids } },
          select: { id: true, student: { select: { name: true } } },
        })
      ).map((invoice) => [invoice.id, invoice.student.name]),
    );
    const results: TuitionTalkResult[] = [];
    for (const invoiceId of ids) {
      const sent = await runTuition(() => sendInvoiceTalk({ invoiceId, baseUrl }, actor));
      results.push({
        invoiceId,
        studentName: names.get(invoiceId) ?? "",
        ...(sent.ok ? { ok: true, resent: sent.data.resent } : { ok: false, error: sent.error }),
      });
    }
    const sentCount = results.filter((r) => r.ok).length;
    return { results, sent: sentCount, failed: results.length - sentCount };
  });
  revalidatePath("/tuition");
  return result;
}

/** 결제사 선불 포인트 잔액 (결제선생 쌤포인트). 포인트를 쓰지 않는 결제사면 null */
export async function loadTuitionProviderBalance(): Promise<
  TuitionResult<{ balance: number | null; chargeUrl: string | null } | null>
> {
  await requireFullAccessActor();
  return runTuition(async () => {
    try {
      return await getTuitionProviderBalance();
    } catch (error) {
      if (error instanceof ProviderError) {
        throw new TuitionError("PROVIDER_UNAVAILABLE", `잔액을 불러오지 못했습니다 — ${error.message}`, 502);
      }
      throw error;
    }
  });
}

// ─── 조회 · 새로고침 (직원 전체) ─────────────────────────────────────────

/** 결제사에 다시 물어 청구서 상태를 맞춘다 (웹훅이 늦거나 빠졌을 때 직원이 누른다) */
export async function refreshTuitionInvoice(
  invoiceId: string,
): Promise<TuitionResult<{ status: Awaited<ReturnType<typeof syncInvoice>>["status"]; changed: boolean }>> {
  await requireStaffActor();
  const result = await runTuition(async () => {
    const synced = await syncInvoice(parseId(invoiceId, "청구서"), "SYNC", { force: true });
    return { status: synced.status, changed: synced.changed };
  });
  revalidatePath("/tuition");
  return result;
}

export async function loadTuitionInvoiceDetail(invoiceId: string): Promise<TuitionResult<AdminInvoiceDetail>> {
  const { fullAccess } = await requireStaffSession();
  return runTuition(async () => {
    const detail = await getTuitionInvoiceDetail(parseId(invoiceId, "청구서"), { fullAccess });
    if (!detail) throw new TuitionError("NOT_FOUND", "청구서를 찾을 수 없습니다", 404);
    return detail;
  });
}

/**
 * 청구서 링크 (/bill/<token>) — 앱이 없는 학부모에게 카카오톡 등으로 보낸다.
 * 링크 기능 이전에 발행돼 토큰이 없는 청구서는 이때 만든다.
 */
export async function getTuitionBillLink(invoiceId: string): Promise<TuitionResult<{ url: string }>> {
  await requireStaffActor();
  return runTuition(async () => {
    const token = await ensureBillToken(parseId(invoiceId, "청구서"));
    if (!token) throw new TuitionError("NOT_FOUND", "청구서를 찾을 수 없습니다", 404);
    return { url: billUrl(token) };
  });
}

// ─── 현금영수증 ─────────────────────────────────────────────────────────
// 발급 자체는 홈택스 등에서 한다. 여기서는 신청 정보·승인번호·취소를 기록한다.

/** 현금영수증 신청 정보 등록·수정 (직원 전체 — 현장에서 수납하며 번호를 받아 적는다) */
export async function requestTuitionCashReceipt(input: {
  paymentId: string;
  purpose: TuitionCashReceiptInput["purpose"];
  identifier: string;
}): Promise<TuitionResult<{ cashReceiptId: string }>> {
  const actor = await requireStaffActor();
  const result = await runTuition(() => {
    if (typeof input !== "object" || input === null) invalid("현금영수증 정보를 확인해 주세요");
    return requestCashReceipt({ paymentId: parseId(input.paymentId, "결제"), ...parseCashReceipt(input) }, actor);
  });
  revalidatePath("/tuition");
  return result;
}

/** 발급 완료 처리 — 국세청 승인번호를 적는다 (원장급) */
export async function markTuitionCashReceiptIssued(
  cashReceiptId: string,
  approvalNumber: string,
): Promise<TuitionResult> {
  const actor = await requireFullAccessActor();
  const result = await runTuition(() =>
    markCashReceiptIssued(
      parseId(cashReceiptId, "현금영수증"),
      parseRequiredText(approvalNumber, "승인번호", 30, "국세청 승인번호를 입력해 주세요"),
      actor,
    ),
  );
  revalidatePath("/tuition");
  return result;
}

/** 현금영수증 취소 기록 — 신청을 거두거나, 발급한 영수증을 취소한 뒤 남긴다 (원장급) */
export async function cancelTuitionCashReceipt(cashReceiptId: string, reason: string): Promise<TuitionResult> {
  const actor = await requireFullAccessActor();
  const result = await runTuition(() =>
    cancelCashReceipt(
      parseId(cashReceiptId, "현금영수증"),
      parseRequiredText(reason, "취소 사유", REASON_MAX, "취소 사유를 입력해 주세요"),
      actor,
    ),
  );
  revalidatePath("/tuition");
  return result;
}

// ─── 내보내기 (원장급) ───────────────────────────────────────────────────

/** 수납 내역 CSV — 조회한 달 청구서 + 이전 달 미납 (엑셀용 BOM 은 내려받는 화면이 붙인다) */
export async function exportTuitionCsv(
  ym: string,
): Promise<TuitionResult<{ filename: string; csv: string; count: number }>> {
  await requireFullAccessActor();
  return runTuition(() => {
    if (typeof ym !== "string" || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(ym)) invalid("조회할 달을 확인해 주세요");
    return getTuitionExport({ ym });
  });
}

// ─── 설정 (원장급) ─────────────────────────────────────────────────────

export async function updateTuitionSetting(values: TuitionSettingInput): Promise<TuitionResult> {
  const actor = await requireFullAccessActor();
  const result = await runTuition(async () => {
    if (typeof values !== "object" || values === null) invalid("설정 값을 확인해 주세요");
    if (!REFUND_POLICIES.includes(values.refundPolicy)) invalid("환불 계산 방식을 선택해 주세요");
    if (typeof values.onlinePaymentEnabled !== "boolean") invalid("온라인 결제 사용 여부를 확인해 주세요");
    if (!TAX_TYPES.includes(values.taxType)) invalid("과세 유형을 선택해 주세요");
    if (typeof values.autoIssueEnabled !== "boolean") invalid("자동 청구 사용 여부를 확인해 주세요");
    const data = {
      defaultMonthlyFee: parseMonthlyFeeOrNull(values.defaultMonthlyFee, "기본 월 수강료"),
      dueDays: parseInteger(values.dueDays, 0, SETTING_DAYS_MAX, `납부 기한 일수는 0~${SETTING_DAYS_MAX} 사이여야 합니다`),
      leadDays: parseInteger(
        values.leadDays,
        0,
        SETTING_DAYS_MAX,
        `청구 예정 표시 기준 일수는 0~${SETTING_DAYS_MAX} 사이여야 합니다`,
      ),
      reminderDays: parseReminderDaysText(values.reminderDays),
      refundPolicy: values.refundPolicy,
      onlinePaymentEnabled: values.onlinePaymentEnabled,
      taxType: values.taxType,
      autoIssueEnabled: values.autoIssueEnabled,
      autoIssueLeadDays: parseInteger(
        values.autoIssueLeadDays,
        0,
        AUTO_ISSUE_LEAD_DAYS_MAX,
        `자동 청구 시점은 이용 종료 0~${AUTO_ISSUE_LEAD_DAYS_MAX}일 전 사이로 정해 주세요`,
      ),
      guideText: parseOptionalText(values.guideText, "학부모 안내문", GUIDE_TEXT_MAX),
      onsiteGuideText: parseOptionalText(values.onsiteGuideText, "현장 결제 안내문", GUIDE_TEXT_MAX),
      updatedById: actor.id,
    };
    await prisma.tuitionSetting.upsert({
      where: { id: "default" },
      create: { id: "default", ...data },
      update: data,
    });
  });
  revalidatePath("/tuition");
  return result;
}

/** 학생별 수강료 — monthlyFee 가 null 이면 기본 수강료를 쓴다. billingPaused 는 청구 예정 목록에서만 빠진다 */
export async function updateTuitionProfile(input: TuitionProfileInput): Promise<TuitionResult> {
  const actor = await requireFullAccessActor();
  const result = await runTuition(async () => {
    if (typeof input !== "object" || input === null) invalid("수강료 정보를 확인해 주세요");
    if (typeof input.billingPaused !== "boolean") invalid("청구 제외 여부를 확인해 주세요");
    const studentId = parseId(input.studentId, "학생");
    const data = {
      monthlyFee: parseMonthlyFeeOrNull(input.monthlyFee, "월 수강료"),
      billingPaused: input.billingPaused,
      memo: parseOptionalText(input.memo, "메모", MEMO_MAX),
      updatedById: actor.id,
    };
    const student = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true } });
    if (!student) throw new TuitionError("NOT_FOUND", "학생을 찾을 수 없습니다", 404);
    await prisma.tuitionProfile.upsert({
      where: { studentId },
      create: { studentId, ...data },
      update: data,
    });
  });
  revalidatePath("/tuition");
  return result;
}
