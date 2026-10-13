import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";

import { verifyCronSecret } from "@/lib/cron-auth";
import { runTuitionReconcile } from "@/lib/tuition/core";

export const dynamic = "force-dynamic";
// 진행 중 결제·환불마다 결제사를 다시 조회한다
export const maxDuration = 60;

/**
 * 15분마다 실행 (.github/workflows/tuition-sync.yml) — 수강료 결제 대조.
 * 웹훅이 빠졌거나 응답을 못 받은 결제·환불을 결제사와 맞추고, 기한이 지난 결제 링크를 닫는다.
 * 워크플로가 실패 시 재시도하고 실행이 겹칠 수 있다 — 같은 건을 두 번 반영하지 않는 것은 코어의 몫이다.
 */
export async function GET(request: NextRequest) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;

  const result = await runTuitionReconcile();
  if (result.synced + result.refundsSettled + result.expired > 0) revalidatePath("/tuition");

  return Response.json({ ok: true, ...result });
}
