// 수강료 변경 이력 기록 (추가 전용) — 청구서 상세의 진행 기록이 이 표를 읽는다.
// 상태를 바꾸는 트랜잭션 안에서는 tx 로, 커밋 뒤 결과(링크 생성 실패 등)는 전역 prisma 로 남긴다.
// detail 에는 사람이 읽는 한 줄만 — 개인정보(전화번호·계좌)나 결제사 응답 원문은 넣지 않는다.

import type { Prisma } from "@/generated/prisma/client";
import type { TuitionActor, TuitionEventSource, TuitionEventType } from "@/lib/tuition/types";

type EventWriter = Pick<Prisma.TransactionClient, "tuitionEvent">;

export type TuitionEventInput = {
  type: TuitionEventType;
  source: TuitionEventSource;
  invoiceId?: string | null;
  paymentId?: string | null;
  refundId?: string | null;
  actor?: TuitionActor | null;
  detail?: string | null;
};

export async function recordTuitionEvent(db: EventWriter, event: TuitionEventInput): Promise<void> {
  await db.tuitionEvent.create({
    data: {
      type: event.type,
      source: event.source,
      invoiceId: event.invoiceId ?? null,
      paymentId: event.paymentId ?? null,
      refundId: event.refundId ?? null,
      actorId: event.actor?.id ?? null,
      actorName: event.actor?.name ?? null,
      detail: event.detail ? event.detail.slice(0, 500) : null,
    },
  });
}
