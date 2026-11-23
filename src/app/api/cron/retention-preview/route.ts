import { NextRequest, NextResponse } from "next/server";

import { verifyCronSecret } from "@/lib/cron-auth";
import { runRetention } from "@/lib/privacy/retention";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 매일 KST 03:00 — 보유 기간이 지난 정보의 건수를 세어 기록한다. 삭제는 RETENTION_PURGE=1 일 때만 */
export async function GET(request: NextRequest) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;
  return NextResponse.json({ ok: true, ...(await runRetention()) });
}
