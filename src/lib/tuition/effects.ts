// 커밋 뒤 작업 — 학부모 푸시, Slack, 결제 링크 폐기, 입금 대기 주문 닫기, 자동 환불 실행.
//
// 코어의 트랜잭션은 DB 상태만 바꾸고 "할 일" 목록(TuitionEffect[])을 돌려준다. 여기서 그 목록을 실행한다.
// 연결이 1개뿐이라 트랜잭션 안에서 외부 호출을 하면 안 되기 때문이다 (lock.ts 참고).
//
// 전부 실패해도 되는 작업이다 — 돈이 걸린 것(자동 환불)은 DB 에 PENDING 행이 먼저 남아 있어
// 15분 주기 대조(reconcile.ts)가 다시 집어 간다. 그래서 여기서는 절대 throw 하지 않는다.

import { after } from "next/server";

import type { TuitionNoticeKind } from "@/generated/prisma/enums";
import { notifySlack } from "@/lib/slack";
import { getTuitionProvider } from "@/lib/tuition/provider-registry";

export type TuitionEffect =
  | { kind: "notice"; invoiceId: string; noticeKind: TuitionNoticeKind; refundAmount?: number }
  | { kind: "slack"; text: string }
  /** 더는 쓰지 않는 결제 링크 폐기 — 실패해도 뒤늦은 결제는 자동 환불로 걸러진다. 금액은 폐기 요청에 필요한 결제사가 있어 싣는다 */
  | { kind: "closeLinks"; links: { productKey: string; amount: number }[] }
  /** 입금 대기 중인 가상계좌 주문 닫기 — 닫지 못해도 입금되면 자동 환불 대상이 된다 */
  | { kind: "voidOrders"; orderKeys: string[] }
  | { kind: "processRefund"; refundId: string };

async function runOne(effect: TuitionEffect): Promise<void> {
  switch (effect.kind) {
    case "notice": {
      const { sendTuitionNotice } = await import("@/lib/tuition/notices");
      await sendTuitionNotice({
        invoiceId: effect.invoiceId,
        kind: effect.noticeKind,
        refundAmount: effect.refundAmount,
      });
      return;
    }
    case "slack":
      await notifySlack(effect.text);
      return;
    case "closeLinks": {
      const provider = getTuitionProvider();
      if (!provider) return;
      for (const link of effect.links) {
        await provider.deleteLink(link.productKey, { amount: link.amount }).catch((error) => {
          console.error("[tuition:effects] 결제 링크 폐기 실패", error instanceof Error ? error.message : error);
        });
      }
      return;
    }
    case "voidOrders": {
      const provider = getTuitionProvider();
      if (!provider) return;
      const { applyProviderOrderNow } = await import("@/lib/tuition/settle");
      for (const orderKey of effect.orderKeys) {
        try {
          const order = await provider.cancelOrder({
            orderKey,
            reason: "결제 대기 종료",
            idempotencyKey: `void:${orderKey}`,
          });
          await applyProviderOrderNow(order, "SYSTEM");
        } catch (error) {
          console.error("[tuition:effects] 입금 대기 주문 닫기 실패", error instanceof Error ? error.message : error);
        }
      }
      return;
    }
    case "processRefund": {
      const { processRefund } = await import("@/lib/tuition/refund");
      await processRefund(effect.refundId);
      return;
    }
  }
}

/** 바로 실행하고 끝날 때까지 기다린다 (cron·동기화처럼 결과를 확인해야 하는 경로). throw 하지 않는다 */
export async function runTuitionEffects(effects: TuitionEffect[]): Promise<void> {
  for (const effect of effects) {
    try {
      await runOne(effect);
    } catch (error) {
      console.error(`[tuition:effects] ${effect.kind} 실패`, error instanceof Error ? error.message : error);
    }
  }
}

/** 응답을 보낸 뒤 실행 (Vercel waitUntil). 요청 스코프 밖(스크립트·테스트)이면 그냥 비동기로 */
export function dispatchTuitionEffects(effects: TuitionEffect[]): void {
  if (effects.length === 0) return;
  const run = () => runTuitionEffects(effects);
  try {
    after(run);
  } catch {
    void run();
  }
}
