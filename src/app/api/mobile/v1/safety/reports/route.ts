import type { NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson } from "@/lib/mobile-auth";
import { requireSafetyActor } from "@/lib/mobile-safety";
import { createReport } from "@/lib/safety";

/** 신고 접수 { targetType, targetId? | userType+userId, reason, detail? } — 운영진에게 전달 */
export async function POST(request: NextRequest) {
  try {
    const [actor, body] = await Promise.all([requireSafetyActor(request), request.json()]);
    return mobileJson(await createReport(actor, body));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
