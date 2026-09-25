import type { NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson, requireMobileAnyStaff } from "@/lib/mobile-auth";
import { getMobileStaffToday } from "@/lib/mobile-staff-home";

// 직원 홈 — 오프라인·온라인 운영진 모두. 항목은 capabilities 에 따라 채워진다.
export async function GET(request: NextRequest) {
  try {
    const user = await requireMobileAnyStaff(request);
    return mobileJson(await getMobileStaffToday(user));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
