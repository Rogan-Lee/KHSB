import type { NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson, requireMobileStaff } from "@/lib/mobile-auth";
import { getMobileStaffLunch } from "@/lib/mobile-staff-lunch";

// GET ?date=YYYY-MM-DD (기본 오늘) — 그날 도시락 수령 명단 + 학부모 변경 요청
export async function GET(request: NextRequest) {
  try {
    await requireMobileStaff(request);
    return mobileJson(await getMobileStaffLunch(request.nextUrl.searchParams.get("date")));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
