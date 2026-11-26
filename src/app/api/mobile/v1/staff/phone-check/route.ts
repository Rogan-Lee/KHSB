import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import { getStaffPhoneCheckBoard } from "@/lib/mobile-staff-ops-phone";

// ?date=YYYY-MM-DD (기본 오늘, KST) &period=0|교시 번호|current (기본 0 = 입실 검사, 옛 앱 호환)
export async function GET(request: NextRequest) {
  try {
    await requireMobileStaff(request);
    const params = request.nextUrl.searchParams;
    return mobileJson(await getStaffPhoneCheckBoard(params.get("date"), params.get("period")));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
