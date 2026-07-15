import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { applyDueScheduledProposals } from "@/lib/online/schedule-commit";

export const dynamic = "force-dynamic";

// KST 00시 — 실행 예정일이 도래한 승인 등원 스케줄 제안을 입퇴실 일정에 자동 반영
export async function GET(request: NextRequest) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;

  const result = await applyDueScheduledProposals();
  return NextResponse.json({ ok: true, ...result });
}
