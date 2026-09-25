import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import { getStaffPhoneCheckBoard } from "@/lib/mobile-staff-ops-phone";

// ?date=YYYY-MM-DD (기본 오늘, KST)
export async function GET(request: NextRequest) {
  try {
    await requireMobileStaff(request);
    const date = request.nextUrl.searchParams.get("date");
    return mobileJson(await getStaffPhoneCheckBoard(date));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
