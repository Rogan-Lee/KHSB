import { NextRequest, NextResponse } from "next/server";

import { verifyCronSecret } from "@/lib/cron-auth";
import { runRetention } from "@/lib/privacy/retention";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 매일 KST 03:00 — 보유 기간이 지난 정보·와이파이 기기를 세어 기록하고 지운다. 퇴원생 파기는 RETENTION_PURGE_STUDENTS=1 일 때만. RETENTION_PURGE=0 이면 세기만 */
export async function GET(request: NextRequest) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;
  return NextResponse.json({ ok: true, ...(await runRetention()) });
}
