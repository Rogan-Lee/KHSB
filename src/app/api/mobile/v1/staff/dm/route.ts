import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileAnyStaff,
} from "@/lib/mobile-auth";
import { getMobileStaffDmInbox } from "@/lib/mobile-staff-dm";

/** 직원 DM 목록 { threads, staff } — staff 는 "새 메시지" 상대 목록 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireMobileAnyStaff(request);
    return mobileJson(await getMobileStaffDmInbox(user.id));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
