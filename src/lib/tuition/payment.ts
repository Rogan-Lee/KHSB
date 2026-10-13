// 결제 시작(결제 링크 발급)과 현장 결제 신청·확인.
// 학부모 경로는 호출 측이 ParentLink 로 자녀를 검증한 뒤 studentId 를 넘긴다 — 여기서는 청구서가 그 자녀 것인지 다시 본다.

import { getAppUrl } from "@/lib/app-url";
import { prisma } from "@/lib/prisma";
import { dispatchTuitionEffects, type TuitionEffect } from "@/lib/tuition/effects";
import { recordTuitionEvent } from "@/lib/tuition/events";
import { maskName, PAYMENT_METHOD_LABEL, won } from "@/lib/tuition/format";
import { lockTuitionStudent, TUITION_TX } from "@/lib/tuition/lock";
import { closeLivePayments } from "@/lib/tuition/payment-rows";
import { ProviderError } from "@/lib/tuition/provider";
import { getTuitionProvider } from "@/lib/tuition/provider-registry";
import { getTuitionSetting } from "@/lib/tuition/settings";
import {
  TuitionError,
  type OnsiteConfirmMethod,
  type OnsiteRequestMethod,
  type TuitionActor,
} from "@/lib/tuition/types";

/** 결제 링크 유효 기간 — 지나면 다음 결제 시작 때 새 링크를 만든다 */
const LINK_VALID_MS = 14 * 86_400_000;
/** 기한이 이만큼도 안 남은 링크는 다시 쓰지 않는다 (결제 도중 만료 방지) */
const LINK_REUSE_MARGIN_MS = 10 * 60_000;
const MAX_MEMO_LEN = 300;

const ONSITE_REQUEST_METHODS: readonly OnsiteRequestMethod[] = ["LOCAL_CURRENCY", "ONSITE_CARD"];
const ONSITE_CONFIRM_METHODS: readonly OnsiteConfirmMethod[] = [
  "LOCAL_CURRENCY",
  "ONSITE_CARD",
  "CASH",
  "TRANSFER",
];

/** 납부할 수 없는 상태면 사유에 맞는 오류를 던진다 */
function assertPayable(status: string): void {
  if (status === "REQUESTED") return;
  if (status === "CANCELED") throw new TuitionError("INVOICE_NOT_PAYABLE", "취소된 청구서예요", 409);
  throw new TuitionError("ALREADY_PAID", "이미 납부된 수강료예요", 409);
}

/**
 * 결제가 끝난 뒤 돌아올 주소 — 청구서 링크 화면. 개발에서는 접속한 서버 주소로 만든다 (모의 결제 확인용).
 * 토큰이 없는 청구서(링크 기능 이전 발행)는 돌아올 곳이 없다.
 */
export function checkoutReturnUrl(shareToken: string | null, devBaseUrl: string | undefined): string | undefined {
  if (!shareToken) return undefined;
  const origin = process.env.NODE_ENV !== "production" && devBaseUrl ? devBaseUrl : getAppUrl();
  return `${origin.replace(/\/+$/, "")}/bill/${shareToken}`;
}

/** 청구서가 이 학생 것인지 확인하고 학생 id 를 돌려준다 (락을 잡기 전의 가벼운 조회) */
async function resolveInvoiceStudent(invoiceId: string, studentId?: string): Promise<string> {
  const invoice = await prisma.tuitionInvoice.findUnique({
    where: { id: invoiceId },
    select: { studentId: true },
  });
  if (!invoice || (studentId !== undefined && invoice.studentId !== studentId)) {
    throw new TuitionError("NOT_FOUND", "청구서를 찾을 수 없습니다", 404);
  }
  return invoice.studentId;
}

/**
 * 결제 시작 — 결제 링크를 돌려준다.
 *  · 청구서당 진행 중인 링크는 하나. 두 번 누르거나 부모 둘이 동시에 눌러도 같은 링크가 나간다.
 *  · 링크 생성(결제사 호출)은 트랜잭션 밖에서 한다. 결제 행 id 를 멱등키로 쓰므로
 *    응답을 못 받고 끊겨도 다음 호출이 같은 링크를 이어서 받는다.
 */
export async function startCheckout(input: {
  invoiceId: string;
  studentId: string;
  /** 앱에서 온 요청이면 학부모 계정 id, 청구서 링크(계정 없음)면 null */
  authUserId: string | null;
  /** 모의 결제 페이지 주소를 만들 때 쓰는 서버 주소 (request.nextUrl.origin) */
  baseUrl?: string;
}): Promise<{ paymentId: string; payUrl: string; expiresAt: string }> {
  const provider = getTuitionProvider();
  if (!provider || !(await getTuitionSetting()).onlinePaymentEnabled) {
    // 앱에 그대로 보이는 문구 — 미완성 기능처럼 읽히는 표현("준비 중")은 쓰지 않는다 (docs/app-store-review.md)
    throw new TuitionError("ONLINE_DISABLED", "지금은 현장 결제만 받고 있어요. 독서실에서 결제해 주세요", 409);
  }
  const studentId = await resolveInvoiceStudent(input.invoiceId, input.studentId);

  const prepared = await prisma.$transaction(async (tx) => {
    await lockTuitionStudent(tx, studentId);

    const invoice = await tx.tuitionInvoice.findUnique({
      where: { id: input.invoiceId },
      select: {
        status: true,
        title: true,
        amount: true,
        parentMessage: true,
        shareToken: true,
        student: { select: { name: true, parentPhone: true } },
      },
    });
    if (!invoice) throw new TuitionError("NOT_FOUND", "청구서를 찾을 수 없습니다", 404);
    assertPayable(invoice.status);

    const payments = await tx.tuitionPayment.findMany({
      where: { invoiceId: input.invoiceId, status: { in: ["PENDING", "ONSITE_REQUESTED"] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        amount: true,
        payUrl: true,
        expiresAt: true,
        providerProductKey: true,
        providerOrderKey: true,
      },
    });
    if (payments.some((p) => p.status === "ONSITE_REQUESTED")) {
      throw new TuitionError("ONSITE_REQUEST_EXISTS", "현장 결제 신청을 철회한 뒤 결제해 주세요", 409);
    }

    const now = new Date();
    const effects: TuitionEffect[] = [];
    const live = payments.find((p) => p.status === "PENDING") ?? null;
    const reusable =
      live !== null &&
      live.amount === invoice.amount &&
      // 주문이 붙은 링크(가상계좌 입금 대기)는 재고가 소진돼 다시 열 수 없다 → 새 링크로 바꾼다
      live.providerOrderKey === null &&
      live.expiresAt !== null &&
      live.expiresAt.getTime() > now.getTime() + LINK_REUSE_MARGIN_MS;

    let payment: { id: string; payUrl: string | null; expiresAt: Date };
    if (live && reusable) {
      // 결제사가 알림톡으로 보낸 청구서인데 결제 주소를 받지 못한 경우 — 새로 만들면 방금 보낸 알림톡이 못 쓰게 된다
      if (live.payUrl === null && live.providerProductKey && provider.isNotifyLink?.(live.providerProductKey)) {
        throw new TuitionError("INVOICE_NOT_PAYABLE", "카카오톡으로 받으신 청구서에서 결제해 주세요", 409);
      }
      await tx.tuitionPayment.update({ where: { id: live.id }, data: { checkoutStartedAt: now } });
      payment = { id: live.id, payUrl: live.payUrl, expiresAt: live.expiresAt as Date };
    } else {
      if (live) {
        effects.push(...(await closeLivePayments(tx, input.invoiceId, "REPLACED", { onlyLinks: true })));
      }
      const expiresAt = new Date(now.getTime() + LINK_VALID_MS);
      const created = await tx.tuitionPayment.create({
        data: {
          invoiceId: input.invoiceId,
          method: "LINK",
          status: "PENDING",
          amount: invoice.amount,
          expiresAt,
          checkoutStartedAt: now,
          requestedByAuthUserId: input.authUserId,
          requestedAt: now,
        },
        select: { id: true },
      });
      // 링크 키를 미리 정할 수 있는 결제사면 지금 적어 둔다 — 생성 응답을 못 받아도 뒤늦은 결제를 이 행과 이을 수 있다
      const linkKey = provider.linkKeyFor?.(created.id);
      if (linkKey) {
        await tx.tuitionPayment.update({ where: { id: created.id }, data: { providerProductKey: linkKey } });
      }
      await recordTuitionEvent(tx, {
        type: "CHECKOUT_OPENED",
        source: "PARENT",
        invoiceId: input.invoiceId,
        paymentId: created.id,
        detail: `온라인 결제 시작 ${won(invoice.amount)}`,
      });
      payment = { id: created.id, payUrl: null, expiresAt };
    }

    return {
      payment,
      amount: invoice.amount,
      // 결제 링크는 가진 사람 누구나 볼 수 있으므로 이름 가운데를 가린다
      linkName: `${maskName(invoice.student.name)} ${invoice.title}`,
      title: invoice.title,
      // 결제사 청구서에 고객명으로 찍히고 운영진이 결제사 화면에서 누구 것인지 알아보는 값 — 결제사에만 전달한다
      customer: { name: invoice.student.name, phone: invoice.student.parentPhone, key: studentId },
      message: invoice.parentMessage ?? undefined,
      returnUrl: checkoutReturnUrl(invoice.shareToken, input.baseUrl),
      effects,
    };
  }, TUITION_TX);

  dispatchTuitionEffects(prepared.effects);
  const { payment } = prepared;
  if (payment.payUrl) {
    return { paymentId: payment.id, payUrl: payment.payUrl, expiresAt: payment.expiresAt.toISOString() };
  }

  // ── 여기부터 트랜잭션 밖 — 결제사 호출 ──
  let link: { productKey: string; url: string };
  try {
    const created = await provider.createLink({
      paymentId: payment.id,
      name: prepared.linkName,
      amount: prepared.amount,
      validThrough: payment.expiresAt,
      baseUrl: input.baseUrl,
      title: prepared.title,
      customer: prepared.customer,
      message: prepared.message,
      returnUrl: prepared.returnUrl,
    });
    // 결제 주소 없이는 결제창을 열 수 없다 — 다시 시도하게 한다
    if (!created.url) throw new ProviderError("결제 주소를 받지 못했습니다", "unavailable");
    link = { productKey: created.productKey, url: created.url };
  } catch (error) {
    if (error instanceof ProviderError && error.kind === "rejected") {
      // 명확한 거절 — 이 결제 행은 실패로 닫는다. 다음 결제 시작은 새 행(새 멱등키)으로 다시 시도한다
      await prisma.tuitionPayment.updateMany({
        where: { id: payment.id, status: "PENDING", payUrl: null },
        data: { status: "FAILED", failCode: error.code, failMessage: error.message.slice(0, 300) },
      });
      await recordTuitionEvent(prisma, {
        type: "LINK_FAILED",
        source: "SYSTEM",
        invoiceId: input.invoiceId,
        paymentId: payment.id,
        detail: `결제 링크 생성 실패 — ${error.message}`,
      });
      throw new TuitionError("PROVIDER_REJECTED", "결제 링크를 만들지 못했어요. 독서실로 문의해 주세요", 502);
    }
    // 응답 없음 — 링크가 만들어졌는지 알 수 없다. 행을 그대로 두면 다음 호출이 같은 멱등키로 이어받는다
    throw new TuitionError(
      "PROVIDER_UNAVAILABLE",
      "결제 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요",
      503,
    );
  }

  const stored = await prisma.tuitionPayment.updateMany({
    where: { id: payment.id, status: "PENDING", payUrl: null },
    data: { providerProductKey: link.productKey, payUrl: link.url },
  });
  if (stored.count === 1) {
    await recordTuitionEvent(prisma, {
      type: "LINK_CREATED",
      source: "SYSTEM",
      invoiceId: input.invoiceId,
      paymentId: payment.id,
      detail: "결제 링크 생성",
    });
    return { paymentId: payment.id, payUrl: link.url, expiresAt: payment.expiresAt.toISOString() };
  }

  // 그 사이에 다른 요청이 같은 링크를 저장했거나(같은 멱등키 → 같은 링크), 결제 행이 닫혔다
  const current = await prisma.tuitionPayment.findUnique({
    where: { id: payment.id },
    select: { status: true, payUrl: true },
  });
  if (current?.status === "PENDING" && current.payUrl) {
    return { paymentId: payment.id, payUrl: current.payUrl, expiresAt: payment.expiresAt.toISOString() };
  }
  dispatchTuitionEffects([{ kind: "closeLinks", links: [{ productKey: link.productKey, amount: prepared.amount }] }]);
  throw new TuitionError("INVOICE_NOT_PAYABLE", "결제할 수 없는 상태예요. 화면을 새로 고쳐 주세요", 409);
}

/** 휴대폰번호 형식인지 (숫자만 남겨 01x 로 시작하는 10~11자리) */
function isMobileNumber(phone: string | null | undefined): boolean {
  return /^01[016789]\d{7,8}$/.test((phone ?? "").replace(/[^0-9]/g, ""));
}

/**
 * 결제사 알림 청구서 발송 — 결제사가 학부모 휴대폰으로 카카오 알림톡 청구서를 직접 보낸다 (결제선생 TALK).
 * 호출 측이 원장급 권한을 먼저 검증한다. 보낼 때마다 결제사 포인트가 차감된다.
 *  · 이미 알림톡으로 보낸 청구서가 살아 있으면 같은 청구서를 다시 보낸다 (재발송).
 *  · 없으면 진행 중인 결제 링크를 닫고 알림톡용 청구서를 새로 만든다. 학부모가 앱·청구서 링크에서
 *    "결제하기"를 눌러도 이 청구서의 결제 주소가 열린다 (청구서당 진행 중인 링크는 하나).
 */
export async function sendInvoiceTalk(
  input: { invoiceId: string; baseUrl?: string },
  actor: TuitionActor,
): Promise<{ paymentId: string; resent: boolean }> {
  const provider = getTuitionProvider();
  if (!provider?.canNotify || !provider.linkKeyFor) {
    throw new TuitionError("PROVIDER_UNAVAILABLE", "카카오 알림톡 청구서를 보낼 수 있는 결제 설정이 아닙니다", 409);
  }
  if (!(await getTuitionSetting()).onlinePaymentEnabled) {
    throw new TuitionError("ONLINE_DISABLED", "온라인 결제를 받지 않는 설정에서는 알림톡 청구서를 보낼 수 없습니다", 409);
  }
  const linkKeyFor = provider.linkKeyFor.bind(provider);
  const studentId = await resolveInvoiceStudent(input.invoiceId);

  const prepared = await prisma.$transaction(async (tx) => {
    await lockTuitionStudent(tx, studentId);

    const invoice = await tx.tuitionInvoice.findUnique({
      where: { id: input.invoiceId },
      select: {
        status: true,
        title: true,
        amount: true,
        parentMessage: true,
        student: { select: { name: true, parentPhone: true } },
      },
    });
    if (!invoice) throw new TuitionError("NOT_FOUND", "청구서를 찾을 수 없습니다", 404);
    assertPayable(invoice.status);
    if (!isMobileNumber(invoice.student.parentPhone)) {
      throw new TuitionError("INVALID_INPUT", "학부모 휴대폰 번호가 없거나 형식이 올바르지 않습니다. 원생 정보에서 확인해 주세요");
    }

    const payments = await tx.tuitionPayment.findMany({
      where: { invoiceId: input.invoiceId, status: { in: ["PENDING", "ONSITE_REQUESTED"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, amount: true, expiresAt: true, providerProductKey: true, providerOrderKey: true },
    });
    if (payments.some((p) => p.status === "ONSITE_REQUESTED")) {
      throw new TuitionError(
        "ONSITE_REQUEST_EXISTS",
        "학부모가 현장 결제를 신청한 청구서입니다. 신청을 반려한 뒤 보내 주세요",
        409,
      );
    }

    const now = new Date();
    const live = payments.find((p) => p.status === "PENDING") ?? null;
    const bill = {
      amount: invoice.amount,
      title: invoice.title,
      linkName: `${maskName(invoice.student.name)} ${invoice.title}`,
      customer: { name: invoice.student.name, phone: invoice.student.parentPhone, key: studentId },
      message: invoice.parentMessage ?? undefined,
    };
    // 이미 알림톡으로 보낸 청구서가 그대로 살아 있으면 다시 보내기만 한다
    if (
      live?.providerProductKey &&
      provider.isNotifyLink?.(live.providerProductKey) &&
      live.amount === invoice.amount &&
      live.providerOrderKey === null &&
      live.expiresAt !== null &&
      live.expiresAt.getTime() > now.getTime() + LINK_REUSE_MARGIN_MS
    ) {
      return {
        ...bill,
        resend: true,
        paymentId: live.id,
        productKey: live.providerProductKey,
        expiresAt: live.expiresAt,
        effects: [],
      };
    }

    const effects = live ? await closeLivePayments(tx, input.invoiceId, "REPLACED", { onlyLinks: true }) : [];
    const expiresAt = new Date(now.getTime() + LINK_VALID_MS);
    const created = await tx.tuitionPayment.create({
      data: { invoiceId: input.invoiceId, method: "LINK", status: "PENDING", amount: invoice.amount, expiresAt, requestedAt: now },
      select: { id: true },
    });
    const productKey = linkKeyFor(created.id, { notify: true });
    await tx.tuitionPayment.update({ where: { id: created.id }, data: { providerProductKey: productKey } });
    return { ...bill, resend: false, paymentId: created.id, productKey, expiresAt, effects };
  }, TUITION_TX);

  dispatchTuitionEffects(prepared.effects);

  // ── 여기부터 트랜잭션 밖 — 결제사 호출 ──
  let resent = prepared.resend;
  try {
    if (resent) {
      try {
        if (!provider.resendLink) throw new ProviderError("재발송을 지원하지 않는 결제사입니다", "rejected");
        await provider.resendLink(prepared.productKey);
      } catch (error) {
        // 앞선 발송이 결제사에 닿지 않아 청구서가 없는 경우 — 같은 결제 행으로 새로 만들어 보낸다
        if (!(error instanceof ProviderError && error.code === "LINK_NOT_FOUND")) throw error;
        resent = false;
      }
    }
    if (!resent) {
      const link = await provider.createLink({
        paymentId: prepared.paymentId,
        name: prepared.linkName,
        amount: prepared.amount,
        validThrough: prepared.expiresAt,
        baseUrl: input.baseUrl,
        title: prepared.title,
        customer: prepared.customer,
        message: prepared.message,
        notify: true,
      });
      // 결제 주소를 받았으면 적어 둔다 — 앱·청구서 링크의 "결제하기"가 같은 청구서를 연다
      await prisma.tuitionPayment.updateMany({
        where: { id: prepared.paymentId, status: "PENDING", payUrl: null },
        data: { providerProductKey: link.productKey, payUrl: link.url },
      });
    }
  } catch (error) {
    if (error instanceof ProviderError && error.kind === "rejected") {
      if (!prepared.resend) {
        await prisma.tuitionPayment.updateMany({
          where: { id: prepared.paymentId, status: "PENDING", payUrl: null },
          data: { status: "FAILED", failCode: error.code, failMessage: error.message.slice(0, 300) },
        });
      }
      await recordTuitionEvent(prisma, {
        type: "LINK_FAILED",
        source: "STAFF",
        invoiceId: input.invoiceId,
        paymentId: prepared.paymentId,
        actor,
        detail: `알림톡 청구서 발송 실패 — ${error.message}`,
      });
      // 운영진 화면에 그대로 보인다 — 결제사가 알려 준 사유(포인트 부족 등)를 함께 보여 준다
      throw new TuitionError("PROVIDER_REJECTED", `알림톡 청구서를 보내지 못했습니다 — ${error.message}`, 502);
    }
    // 응답 없음 — 발송됐는지 알 수 없다. 결제 행은 그대로 두어 다시 눌렀을 때 같은 청구서로 이어 간다
    throw new TuitionError(
      "PROVIDER_UNAVAILABLE",
      "결제사에 연결하지 못했습니다. 발송 여부를 알 수 없으니 잠시 후 다시 시도해 주세요",
      503,
    );
  }

  await recordTuitionEvent(prisma, {
    type: "BILL_TALK_SENT",
    source: "STAFF",
    invoiceId: input.invoiceId,
    paymentId: prepared.paymentId,
    actor,
    detail: resent ? "카카오 알림톡 청구서 재발송" : "카카오 알림톡 청구서 발송",
  });
  return { paymentId: prepared.paymentId, resent };
}

/** 학부모의 현장 결제(지역화폐·현장 카드) 신청. 이미 신청이 있으면 그 신청을 그대로 돌려준다 */
export async function requestOnsitePayment(input: {
  invoiceId: string;
  studentId: string;
  /** 앱에서 온 요청이면 학부모 계정 id, 청구서 링크(계정 없음)면 null */
  authUserId: string | null;
  method: OnsiteRequestMethod;
}): Promise<{ paymentId: string }> {
  if (!ONSITE_REQUEST_METHODS.includes(input.method)) {
    throw new TuitionError("INVALID_INPUT", "결제 수단을 확인해 주세요");
  }
  const studentId = await resolveInvoiceStudent(input.invoiceId, input.studentId);

  const result = await prisma.$transaction(async (tx) => {
    await lockTuitionStudent(tx, studentId);

    const invoice = await tx.tuitionInvoice.findUnique({
      where: { id: input.invoiceId },
      select: { status: true, title: true, amount: true, student: { select: { name: true } } },
    });
    if (!invoice) throw new TuitionError("NOT_FOUND", "청구서를 찾을 수 없습니다", 404);
    assertPayable(invoice.status);

    const existing = await tx.tuitionPayment.findFirst({
      where: { invoiceId: input.invoiceId, status: "ONSITE_REQUESTED" },
      select: { id: true, method: true },
    });
    if (existing) {
      if (existing.method !== input.method) {
        await tx.tuitionPayment.update({ where: { id: existing.id }, data: { method: input.method } });
      }
      return { paymentId: existing.id, effects: [] as TuitionEffect[] };
    }

    // 현장에서 내기로 했으니 열려 있던 결제 링크는 닫는다 (둘 다 결제되는 일을 줄인다)
    const effects = await closeLivePayments(tx, input.invoiceId, "ONSITE_REQUESTED", { onlyLinks: true });
    const now = new Date();
    const created = await tx.tuitionPayment.create({
      data: {
        invoiceId: input.invoiceId,
        method: input.method,
        status: "ONSITE_REQUESTED",
        amount: invoice.amount,
        requestedByAuthUserId: input.authUserId,
        requestedAt: now,
      },
      select: { id: true },
    });
    const label = PAYMENT_METHOD_LABEL[input.method];
    await recordTuitionEvent(tx, {
      type: "ONSITE_REQUESTED",
      source: "PARENT",
      invoiceId: input.invoiceId,
      paymentId: created.id,
      detail: `${label} 현장 결제 신청`,
    });
    effects.push({
      kind: "slack",
      text: `[수강료] ${invoice.student.name} 학부모가 ${label} 현장 결제를 신청했습니다 — ${invoice.title} ${won(invoice.amount)}`,
    });
    return { paymentId: created.id, effects };
  }, TUITION_TX);

  dispatchTuitionEffects(result.effects);
  return { paymentId: result.paymentId };
}

/** 학부모가 현장 결제 신청을 철회. 이미 닫힌 신청이면 조용히 끝낸다 */
export async function withdrawOnsiteRequest(input: {
  paymentId: string;
  studentId: string;
  authUserId: string | null;
}): Promise<void> {
  const payment = await prisma.tuitionPayment.findUnique({
    where: { id: input.paymentId },
    select: { invoiceId: true, invoice: { select: { studentId: true } } },
  });
  if (!payment || payment.invoice.studentId !== input.studentId) {
    throw new TuitionError("NOT_FOUND", "신청 내역을 찾을 수 없습니다", 404);
  }

  await prisma.$transaction(async (tx) => {
    await lockTuitionStudent(tx, input.studentId);
    const withdrawn = await tx.tuitionPayment.updateMany({
      where: { id: input.paymentId, status: "ONSITE_REQUESTED" },
      data: { status: "CANCELED", closedReason: "WITHDRAWN" },
    });
    if (withdrawn.count === 1) {
      await recordTuitionEvent(tx, {
        type: "ONSITE_WITHDRAWN",
        source: "PARENT",
        invoiceId: payment.invoiceId,
        paymentId: input.paymentId,
        detail: "현장 결제 신청 철회",
      });
      return;
    }
    const current = await tx.tuitionPayment.findUnique({
      where: { id: input.paymentId },
      select: { status: true },
    });
    if (current?.status === "DONE") {
      throw new TuitionError("ALREADY_PAID", "이미 결제가 확인됐어요", 409);
    }
  }, TUITION_TX);
}

/**
 * 직원의 현장 결제 확인 — 단말기·현금 등으로 받은 뒤 납부 처리한다.
 * paymentId 를 주면 학부모 신청을 확인 처리하고, 없으면 신청 없이 방문 결제를 기록한다.
 * 그 사이 온라인 결제가 먼저 반영됐으면 ALREADY_PAID 로 거절한다 (단말기 결제는 단말기에서 취소).
 */
export async function confirmOnsitePayment(
  input: {
    invoiceId: string;
    paymentId?: string;
    method: OnsiteConfirmMethod;
    memo?: string | null;
    /** 단말기 승인번호 (카드·지역화폐) — 나중에 대사할 때 쓴다 */
    approvalNumber?: string | null;
  },
  actor: TuitionActor,
): Promise<{ paymentId: string }> {
  if (!ONSITE_CONFIRM_METHODS.includes(input.method)) {
    throw new TuitionError("INVALID_INPUT", "결제 수단을 확인해 주세요");
  }
  const memo = input.memo?.trim().slice(0, MAX_MEMO_LEN) || null;
  const approvalNumber = input.approvalNumber?.trim() || null;
  if (approvalNumber && !/^[A-Za-z0-9-]{1,30}$/.test(approvalNumber)) {
    throw new TuitionError("INVALID_INPUT", "승인번호는 숫자·영문 30자 이내로 입력해 주세요");
  }
  const studentId = await resolveInvoiceStudent(input.invoiceId);

  const result = await prisma.$transaction(async (tx) => {
    await lockTuitionStudent(tx, studentId);

    const invoice = await tx.tuitionInvoice.findUnique({
      where: { id: input.invoiceId },
      select: { status: true, amount: true, periodEnd: true },
    });
    if (!invoice) throw new TuitionError("NOT_FOUND", "청구서를 찾을 수 없습니다", 404);
    if (invoice.status === "CANCELED") {
      throw new TuitionError("INVOICE_NOT_PAYABLE", "취소된 청구서입니다", 409);
    }
    if (invoice.status !== "REQUESTED") {
      throw new TuitionError(
        "ALREADY_PAID",
        "이미 납부 처리된 청구서입니다. 단말기로 결제했다면 단말기에서 취소해 주세요",
        409,
      );
    }

    const now = new Date();
    const paid = {
      status: "DONE" as const,
      method: input.method,
      paidAmount: invoice.amount,
      approvedAt: now,
      confirmedById: actor.id,
      confirmedByName: actor.name ?? null,
      confirmedAt: now,
      memo,
      approvalNumber,
    };
    let paymentId: string;
    if (input.paymentId) {
      const confirmed = await tx.tuitionPayment.updateMany({
        where: { id: input.paymentId, invoiceId: input.invoiceId, status: "ONSITE_REQUESTED" },
        data: paid,
      });
      if (confirmed.count !== 1) {
        throw new TuitionError("INVALID_INPUT", "이미 처리됐거나 철회된 신청입니다", 409);
      }
      paymentId = input.paymentId;
    } else {
      const created = await tx.tuitionPayment.create({
        data: { invoiceId: input.invoiceId, amount: invoice.amount, ...paid },
        select: { id: true },
      });
      paymentId = created.id;
    }

    // 납부 확정은 청구서당 한 번 — 조건부 갱신으로 선점한다 (paidPaymentId unique 가 DB 차원의 보루)
    const claimed = await tx.tuitionInvoice.updateMany({
      where: { id: input.invoiceId, status: "REQUESTED", paidPaymentId: null },
      data: {
        status: "PAID",
        paidAt: now,
        paidAmount: invoice.amount,
        paidPaymentId: paymentId,
        coverageEnd: invoice.periodEnd,
      },
    });
    if (claimed.count !== 1) {
      throw new TuitionError("ALREADY_PAID", "이미 납부 처리된 청구서입니다", 409);
    }

    const effects = await closeLivePayments(tx, input.invoiceId, "INVOICE_PAID", {
      exceptPaymentId: paymentId,
    });
    await recordTuitionEvent(tx, {
      type: "PAYMENT_DONE",
      source: "STAFF",
      invoiceId: input.invoiceId,
      paymentId,
      actor,
      detail: `${PAYMENT_METHOD_LABEL[input.method]} 현장 결제 확인 ${won(invoice.amount)}`,
    });
    effects.push({ kind: "notice", invoiceId: input.invoiceId, noticeKind: "PAID" });
    return { paymentId, effects };
  }, TUITION_TX);

  dispatchTuitionEffects(result.effects);
  return { paymentId: result.paymentId };
}

/** 직원이 현장 결제 신청을 반려 (결제하지 않기로 함). 청구서는 결제 요청 상태로 남는다 */
export async function dismissOnsiteRequest(paymentId: string, actor: TuitionActor): Promise<void> {
  const payment = await prisma.tuitionPayment.findUnique({
    where: { id: paymentId },
    select: { invoiceId: true, invoice: { select: { studentId: true } } },
  });
  if (!payment) throw new TuitionError("NOT_FOUND", "신청 내역을 찾을 수 없습니다", 404);

  await prisma.$transaction(async (tx) => {
    await lockTuitionStudent(tx, payment.invoice.studentId);
    const dismissed = await tx.tuitionPayment.updateMany({
      where: { id: paymentId, status: "ONSITE_REQUESTED" },
      data: { status: "CANCELED", closedReason: "DISMISSED" },
    });
    if (dismissed.count !== 1) {
      throw new TuitionError("INVALID_INPUT", "이미 처리됐거나 철회된 신청입니다", 409);
    }
    await recordTuitionEvent(tx, {
      type: "ONSITE_DISMISSED",
      source: "STAFF",
      invoiceId: payment.invoiceId,
      paymentId,
      actor,
      detail: "현장 결제 신청 반려",
    });
  }, TUITION_TX);
}
