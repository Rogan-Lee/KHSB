import type { NextRequest } from "next/server";

import { verifyCronSecret } from "@/lib/cron-auth";
import { checkPatrolOverdue } from "@/lib/patrol-round";

export const dynamic = "force-dynamic";

// 미순찰 감시 — Supabase pg_cron 이 1분마다 호출 (scripts/sql/2026-11-14-patrol-watch-cron.sql)
export async function GET(request: NextRequest) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;

  return Response.json({ ok: true, ...(await checkPatrolOverdue()) });
}
