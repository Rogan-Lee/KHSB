import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { processQueuedReports } from "@/lib/online/report-queue";

// 온라인 보고서 예약 처리. 결과는 초안(DRAFT)으로 들어가 운영진 승인을 거친다.
//   GET → 오래 기다린 예약부터 서버가 직접 Groq 로 만든다.
// 예약 내용(학생 기록)을 밖으로 내려 주거나 밖에서 만든 글을 받지 않는다.
// 인증: Authorization: Bearer ${CRON_SECRET}
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;
  return NextResponse.json({ ok: true, ...(await processQueuedReports()) });
}
