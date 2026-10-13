// 청구서 링크 — 앱이 없어도 여는 청구서 페이지(/bill/<token>)의 조회와 주소.
//
// 링크를 가진 사람은 로그인 없이 청구 내용을 보고 결제할 수 있다 (토큰이 곧 열쇠).
// 그래서 페이지에는 꼭 필요한 것만 내보낸다: 학생 이름은 가운데를 가리고, 전화번호·결제 식별자·내부 메모는 넣지 않는다.
// 토큰은 192비트 난수라 추측할 수 없고, 청구서마다 다르다.

import { getAppUrl } from "@/lib/app-url";
import { prisma } from "@/lib/prisma";
import {
  dateKey,
  diffDays,
  invoiceDisplayStatus,
  readExtraItems,
  splitTax,
  type TuitionDisplayStatus,
  type TuitionExtraItem,
} from "@/lib/tuition/calc";
import { maskName, PAYMENT_METHOD_LABEL } from "@/lib/tuition/format";
import { newShareToken } from "@/lib/tuition/invoice";
import { getTuitionSetting, isOnlinePaymentAvailable } from "@/lib/tuition/settings";
import type { OnsiteRequestMethod } from "@/lib/tuition/types";
import { todayKST } from "@/lib/utils";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;

/** 청구서 링크 주소 (카카오 안내문에 붙인다) */
export function billUrl(token: string): string {
  return `${getAppUrl().replace(/\/$/, "")}/bill/${token}`;
}

// 앱 주소 — apps/mobile/app.json 의 scheme · android.package 와 같아야 한다
const APP_SCHEME = "studyroom";
const ANDROID_PACKAGE = "com.khsb.mobile";

/** 앱의 수강료 화면을 여는 딥링크 — 앱이 설치된 학부모가 링크 페이지에서 앱으로 넘어갈 때 쓴다 */
export function billAppLink(studentId: string): string {
  return `${APP_SCHEME}://tuition?studentId=${encodeURIComponent(studentId)}`;
}

/**
 * 안드로이드용 앱 주소 (intent). 카카오톡 안 브라우저는 모르는 scheme 을 오류 화면으로 보내므로 intent 로 연다.
 * 앱이 없으면 fallbackUrl 로 돌아온다 (플레이스토어로 보내지 않는다).
 */
export function billAppIntentLink(studentId: string, fallbackUrl: string): string {
  return (
    `intent://tuition?studentId=${encodeURIComponent(studentId)}` +
    `#Intent;scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};` +
    `S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`
  );
}

/** 앱이 없어 intent 가 되돌아왔을 때 붙는 표시 — 페이지가 "앱이 설치되어 있지 않아요"를 안내한다 */
export const BILL_APP_MISSING_PARAM = "app";

export type BillView = {
  invoiceId: string;
  studentId: string;
  /** 가운데를 가린 학생 이름 */
  studentName: string;
  title: string;
  /** YYYY-MM-DD */
  periodStart: string;
  periodEnd: string;
  months: number;
  monthlyFee: number;
  tuitionAmount: number;
  extraItems: TuitionExtraItem[];
  discount: number;
  amount: number;
  /** 과세일 때만 — 공급가액·세액 */
  tax: { supplyAmount: number; taxAmount: number } | null;
  dueDate: string;
  daysToDue: number;
  status: TuitionDisplayStatus;
  parentMessage: string | null;
  guideText: string | null;
  onsiteGuideText: string | null;
  onlinePaymentEnabled: boolean;
  paidAt: string | null;
  paidMethodLabel: string | null;
  refundedAmount: number;
  onsiteRequest: { paymentId: string; method: OnsiteRequestMethod; requestedAt: string } | null;
  /** 결제창을 열었지만 아직 완료가 확인되지 않은 온라인 결제 */
  linkPending: {
    deposit: { bank: string | null; accountNumber: string | null; dueAt: string | null } | null;
  } | null;
  /** 앱의 수강료 화면 주소 (iOS 등) */
  appLink: string;
  /** 안드로이드용 — 앱이 없으면 이 페이지로 되돌아온다 */
  appIntentLink: string;
};

/** 토큰으로 청구서 식별 — 형식이 다르거나 없는 토큰이면 null */
export async function findInvoiceByToken(token: string): Promise<{ id: string; studentId: string } | null> {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) return null;
  return prisma.tuitionInvoice.findUnique({
    where: { shareToken: token },
    select: { id: true, studentId: true },
  });
}

/** 청구서 링크 페이지에 보여 줄 내용. 없는 토큰이면 null */
export async function getBillByToken(token: string): Promise<BillView | null> {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) return null;
  const invoice = await prisma.tuitionInvoice.findUnique({
    where: { shareToken: token },
    select: {
      id: true,
      studentId: true,
      title: true,
      periodStart: true,
      periodEnd: true,
      months: true,
      monthlyFee: true,
      discount: true,
      extraItems: true,
      amount: true,
      taxType: true,
      dueDate: true,
      status: true,
      parentMessage: true,
      paidAt: true,
      paidPaymentId: true,
      refundedAmount: true,
      student: { select: { name: true } },
      payments: {
        where: { status: { in: ["PENDING", "ONSITE_REQUESTED", "DONE"] } },
        select: {
          id: true,
          method: true,
          status: true,
          isDuplicate: true,
          providerMethod: true,
          checkoutStartedAt: true,
          depositBank: true,
          depositAccount: true,
          depositDueAt: true,
          requestedAt: true,
          createdAt: true,
        },
      },
    },
  });
  if (!invoice) return null;

  const [setting, onlinePaymentEnabled] = await Promise.all([getTuitionSetting(), isOnlinePaymentAvailable()]);
  const today = todayKST();
  const waiting = invoice.status === "REQUESTED" ? invoice.payments.filter((p) => !p.isDuplicate) : [];
  const onsite = waiting.find(
    (p) => p.status === "ONSITE_REQUESTED" && (p.method === "LOCAL_CURRENCY" || p.method === "ONSITE_CARD"),
  );
  const link = waiting.find(
    (p) => p.status === "PENDING" && p.method === "LINK" && (p.checkoutStartedAt || p.depositAccount),
  );
  const paid = invoice.paidPaymentId ? invoice.payments.find((p) => p.id === invoice.paidPaymentId) : undefined;
  const tax = invoice.taxType === "TAXABLE" ? splitTax(invoice.amount, "TAXABLE") : null;

  return {
    invoiceId: invoice.id,
    studentId: invoice.studentId,
    studentName: maskName(invoice.student.name),
    title: invoice.title,
    periodStart: dateKey(invoice.periodStart),
    periodEnd: dateKey(invoice.periodEnd),
    months: invoice.months,
    monthlyFee: invoice.monthlyFee,
    tuitionAmount: invoice.monthlyFee * invoice.months,
    extraItems: readExtraItems(invoice.extraItems),
    discount: invoice.discount,
    amount: invoice.amount,
    tax,
    dueDate: dateKey(invoice.dueDate),
    daysToDue: diffDays(today, invoice.dueDate),
    status: invoiceDisplayStatus(invoice, today),
    parentMessage: invoice.parentMessage,
    guideText: setting.guideText,
    onsiteGuideText: setting.onsiteGuideText,
    onlinePaymentEnabled,
    paidAt: invoice.paidAt?.toISOString() ?? null,
    paidMethodLabel: paid
      ? paid.method === "LINK"
        ? `${PAYMENT_METHOD_LABEL.LINK}${paid.providerMethod ? `(${paid.providerMethod})` : ""}`
        : PAYMENT_METHOD_LABEL[paid.method]
      : null,
    refundedAmount: invoice.refundedAmount,
    onsiteRequest:
      onsite && (onsite.method === "LOCAL_CURRENCY" || onsite.method === "ONSITE_CARD")
        ? {
            paymentId: onsite.id,
            method: onsite.method,
            requestedAt: (onsite.requestedAt ?? onsite.createdAt).toISOString(),
          }
        : null,
    linkPending: link
      ? {
          deposit: link.depositAccount
            ? {
                bank: link.depositBank,
                accountNumber: link.depositAccount,
                dueAt: link.depositDueAt?.toISOString() ?? null,
              }
            : null,
        }
      : null,
    appLink: billAppLink(invoice.studentId),
    appIntentLink: billAppIntentLink(invoice.studentId, `${billUrl(token)}?${BILL_APP_MISSING_PARAM}=0`),
  };
}

/**
 * 청구서의 링크 토큰을 돌려준다. 토큰이 없는 청구서(링크 기능 이전에 발행)는 이때 만든다.
 * 동시에 두 번 불려도 한 토큰만 남도록 "비어 있을 때만" 채운다.
 */
export async function ensureBillToken(invoiceId: string): Promise<string | null> {
  const invoice = await prisma.tuitionInvoice.findUnique({
    where: { id: invoiceId },
    select: { shareToken: true },
  });
  if (!invoice) return null;
  if (invoice.shareToken) return invoice.shareToken;
  await prisma.tuitionInvoice.updateMany({
    where: { id: invoiceId, shareToken: null },
    data: { shareToken: newShareToken() },
  });
  const after = await prisma.tuitionInvoice.findUnique({ where: { id: invoiceId }, select: { shareToken: true } });
  return after?.shareToken ?? null;
}
