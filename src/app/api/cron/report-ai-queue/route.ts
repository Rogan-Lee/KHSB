import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { processQueuedAiJobs } from "@/lib/report-ai-queue";

// 리포트 AI 텍스트 예약(본원 월간 종합의견 · 멘토링 코멘트) 처리. 결과는 운영진 확인 대기로 들어간다.
//   GET → 오래 기다린 예약부터 서버가 직접 Groq 로 만든다.
// 예약 내용(학생 기록)을 밖으로 내려 주거나 밖에서 만든 글을 받지 않는다.
// 인증: Authorization: Bearer ${CRON_SECRET}
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;
  return NextResponse.json({ ok: true, ...(await processQueuedAiJobs()) });
}
