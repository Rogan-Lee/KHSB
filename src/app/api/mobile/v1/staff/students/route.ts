import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import { searchStaffStudents } from "@/lib/mobile-staff-ops";

// ?q= 이름·좌석·학교·학년 (비우면 전체, 좌석순)
export async function GET(request: NextRequest) {
  try {
    await requireMobileStaff(request);
    const q = request.nextUrl.searchParams.get("q");
    return mobileJson(await searchStaffStudents(q));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
