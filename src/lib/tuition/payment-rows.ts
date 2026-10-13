// 결제 행 공용 처리 — 진행 중인 결제 닫기. 반드시 학생 락을 잡은 트랜잭션 안에서 부른다.

import type { Prisma } from "@/generated/prisma/client";
import type { TuitionEffect } from "@/lib/tuition/effects";
import type { TuitionPaymentClosedReason } from "@/lib/tuition/types";

/**
 * 청구서의 진행 중 결제(결제 링크 대기·현장 결제 신청)를 모두 닫는다.
 * 닫힌 링크와 입금 대기 주문은 커밋 뒤에 결제사에서도 정리하도록 effect 로 돌려준다.
 * 닫은 뒤에 결제가 들어와도 버려지지 않는다 — settle.ts 가 DONE 으로 되살려 납부 처리하거나 자동 환불한다.
 */
export async function closeLivePayments(
  tx: Prisma.TransactionClient,
  invoiceId: string,
  reason: TuitionPaymentClosedReason,
  options: { exceptPaymentId?: string; onlyLinks?: boolean } = {},
): Promise<TuitionEffect[]> {
  const live = await tx.tuitionPayment.findMany({
    where: {
      invoiceId,
      status: options.onlyLinks ? "PENDING" : { in: ["PENDING", "ONSITE_REQUESTED"] },
      ...(options.exceptPaymentId ? { id: { not: options.exceptPaymentId } } : {}),
    },
    select: { id: true, amount: true, providerProductKey: true, providerOrderKey: true, depositAccount: true },
  });
  if (live.length === 0) return [];

  await tx.tuitionPayment.updateMany({
    where: { id: { in: live.map((p) => p.id) }, status: { in: ["PENDING", "ONSITE_REQUESTED"] } },
    data: { status: "CANCELED", closedReason: reason },
  });

  const links = live.flatMap((p) => (p.providerProductKey ? [{ productKey: p.providerProductKey, amount: p.amount }] : []));
  // 주문이 붙어 있는데 아직 PENDING 이면 가상계좌 입금 대기 중인 주문이다
  const orderKeys = live.map((p) => p.providerOrderKey).filter((k): k is string => !!k);
  const effects: TuitionEffect[] = [];
  if (orderKeys.length > 0) effects.push({ kind: "voidOrders", orderKeys });
  if (links.length > 0) effects.push({ kind: "closeLinks", links });
  return effects;
}
