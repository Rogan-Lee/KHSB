import type { NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson, requireMobileAnyStaff } from "@/lib/mobile-auth";
import { getMobileStaffCalendar } from "@/lib/mobile-staff-home";

// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD (기본: 이번 주 월~일)
export async function GET(request: NextRequest) {
  try {
    const user = await requireMobileAnyStaff(request);
    const params = request.nextUrl.searchParams;
    return mobileJson(await getMobileStaffCalendar(user, params.get("from"), params.get("to")));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
