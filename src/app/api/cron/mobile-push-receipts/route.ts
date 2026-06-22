import type { NextRequest } from "next/server";

import { verifyCronSecret } from "@/lib/cron-auth";
import { processPendingPushReceipts } from "@/lib/mobile-push";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;

  return Response.json({
    ok: true,
    ...(await processPendingPushReceipts()),
  });
}
