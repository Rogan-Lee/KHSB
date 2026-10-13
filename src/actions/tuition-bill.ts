"use server";

// 수강료 청구서 링크(/bill/<token>)의 서버 액션. 이 파일의 export 는 전부 공개 엔드포인트다.
//  · 로그인이 없다 — 인증은 주소의 토큰이다 (도시락 매직링크 액션과 같은 방식). 모든 export 는 맨 먼저
//    토큰으로 청구서를 찾고, 그 청구서에 대해서만 동작한다. 클라이언트가 보낸 다른 식별자는 받지 않는다.
//  · 돈이 움직이는 처리는 전부 코어(@/lib/tuition/core)가 한다. 금액은 서버의 청구서에서만 온다.
//  · 링크는 여러 사람에게 전달될 수 있으므로 결제 시도·현장 결제 신청 횟수를 학생 단위로 제한한다.

import { revalidatePath } from "next/cache";

import { invoiceDisplayStatus, type TuitionDisplayStatus } from "@/lib/tuition/calc";
import {
  assertTuitionDailyAttempts,
  CHECKOUT_DAILY_LIMIT,
  findInvoiceByToken,
  ONSITE_DAILY_LIMIT,
  requestOnsitePayment,
  startCheckout,
  syncInvoice,
  withdrawOnsiteRequest,
} from "@/lib/tuition/core";
import { devRequestOrigin } from "@/lib/tuition/dev-origin";
import { runTuition } from "@/lib/tuition/run";
import { TuitionError, type OnsiteRequestMethod, type TuitionResult } from "@/lib/tuition/types";
import { prisma } from "@/lib/prisma";
import { todayKST } from "@/lib/utils";

const ONSITE_METHODS: readonly OnsiteRequestMethod[] = ["LOCAL_CURRENCY", "ONSITE_CARD"];

/** 토큰으로 청구서를 찾는다. 없는 토큰은 사유를 구분하지 않고 같은 오류로 돌려준다 */
async function requireBill(token: unknown): Promise<{ id: string; studentId: string }> {
  const invoice = typeof token === "string" ? await findInvoiceByToken(token) : null;
  if (!invoice) throw new TuitionError("NOT_FOUND", "청구서를 찾을 수 없습니다", 404);
  return invoice;
}

/** 결제하기 — 결제 링크를 돌려준다 (이미 있으면 같은 링크) */
export async function startBillCheckout(token: string): Promise<TuitionResult<{ payUrl: string }>> {
  const result = await runTuition(async () => {
    const invoice = await requireBill(token);
    await assertTuitionDailyAttempts(
      invoice.studentId,
      ["LINK"],
      CHECKOUT_DAILY_LIMIT,
      "결제 시도가 너무 많아요. 잠시 후 다시 시도하거나 독서실로 문의해 주세요",
    );
    const checkout = await startCheckout({
      invoiceId: invoice.id,
      studentId: invoice.studentId,
      authUserId: null,
      baseUrl: await devRequestOrigin(),
    });
    return { payUrl: checkout.payUrl };
  });
  revalidatePath("/tuition");
  return result;
}

/** 현장 결제(지역화폐·카드 단말기) 신청 */
export async function requestBillOnsite(token: string, method: OnsiteRequestMethod): Promise<TuitionResult> {
  const result = await runTuition(async () => {
    const invoice = await requireBill(token);
    if (!ONSITE_METHODS.includes(method)) throw new TuitionError("INVALID_INPUT", "결제 방법을 골라 주세요");
    await assertTuitionDailyAttempts(
      invoice.studentId,
      ["LOCAL_CURRENCY", "ONSITE_CARD"],
      ONSITE_DAILY_LIMIT,
      "오늘은 현장 결제 신청을 더 할 수 없어요. 독서실로 문의해 주세요",
    );
    await requestOnsitePayment({ invoiceId: invoice.id, studentId: invoice.studentId, authUserId: null, method });
  });
  revalidatePath("/tuition");
  return result;
}

/** 현장 결제 신청 철회 — 이 청구서에 걸린 신청만 */
export async function withdrawBillOnsite(token: string): Promise<TuitionResult> {
  const result = await runTuition(async () => {
    const invoice = await requireBill(token);
    const request = await prisma.tuitionPayment.findFirst({
      where: { invoiceId: invoice.id, status: "ONSITE_REQUESTED" },
      select: { id: true },
    });
    if (!request) return;
    await withdrawOnsiteRequest({ paymentId: request.id, studentId: invoice.studentId, authUserId: null });
  });
  revalidatePath("/tuition");
  return result;
}

/** 결제 확인 — 결제창에서 돌아온 뒤 결제사에 다시 물어 반영한다 (재조회 간격은 코어가 제한) */
export async function syncBill(token: string): Promise<TuitionResult<{ status: TuitionDisplayStatus; paid: boolean }>> {
  const result = await runTuition(async () => {
    const invoice = await requireBill(token);
    const { status, changed } = await syncInvoice(invoice.id, "SYNC");
    if (changed) revalidatePath("/tuition");
    const row = await prisma.tuitionInvoice.findUnique({ where: { id: invoice.id }, select: { dueDate: true } });
    const display = row ? invoiceDisplayStatus({ status, dueDate: row.dueDate }, todayKST()) : status;
    return { status: display, paid: status === "PAID" || status === "PARTIALLY_REFUNDED" };
  });
  return result;
}
