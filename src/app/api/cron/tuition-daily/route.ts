import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";

import { verifyCronSecret } from "@/lib/cron-auth";
import { runTuitionAutoIssue, runTuitionDailyNotices } from "@/lib/tuition/core";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 매일 KST 10:00 실행 (vercel.json "0 1 * * *") — 수강료 자동 청구와 안내.
 *  1) 자동 청구(설정에서 켰을 때만): 이용 종료가 다가온 재원생에게 다음 1개월 청구서 발행
 *  2) 미납 청구서 안내와 이용 종료 전 재결제 안내를 학부모 앱으로 발송
 * 같은 날 다시 불러도 한 번만 발행·발송한다 (코어가 기간 겹침·발송 기록으로 중복을 막는다).
 * 자동 청구를 먼저 돌려, 방금 청구한 학생에게 재결제 안내가 겹쳐 나가지 않게 한다.
 */
export async function GET(request: NextRequest) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;

  const autoIssue = await runTuitionAutoIssue();
  const result = await runTuitionDailyNotices();
  // 새 청구서와 청구서별 안내 발송 기록이 수납 화면에 보인다
  if (autoIssue.issued + result.reminded + result.renewals > 0) revalidatePath("/tuition");

  return Response.json({ ok: true, autoIssued: autoIssue.issued, ...result });
}
