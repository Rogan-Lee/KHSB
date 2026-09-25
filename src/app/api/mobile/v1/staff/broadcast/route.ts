import type { NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson, requireMobileAnyStaff } from "@/lib/mobile-auth";
import { getMobileBroadcastTargets, sendMobileBroadcast } from "@/lib/mobile-staff-notices";

// GET — 대상별 알림 수신 가능 계정 수 (원장 전용)
export async function GET(request: NextRequest) {
  try {
    const user = await requireMobileAnyStaff(request);
    return mobileJson(await getMobileBroadcastTargets(user));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

// POST { audience: ALL|STUDENTS|PARENTS|STAFF, title, body } — 단체 푸시 발송 (원장 전용)
export async function POST(request: NextRequest) {
  try {
    const [user, body] = await Promise.all([requireMobileAnyStaff(request), request.json()]);
    return mobileJson(await sendMobileBroadcast(user, body));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
