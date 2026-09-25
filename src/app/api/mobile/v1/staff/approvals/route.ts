import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import { getMobileStaffApprovals } from "@/lib/mobile-staff-approvals";

/** 승인함 — 대기 신청(기본) 또는 ?history=1 최근 14일 처리 내역. summary 는 항상 대기 건수 */
export async function GET(request: NextRequest) {
  try {
    await requireMobileStaff(request);
    const history = request.nextUrl.searchParams.get("history") === "1";
    return mobileJson(await getMobileStaffApprovals({ history }));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
