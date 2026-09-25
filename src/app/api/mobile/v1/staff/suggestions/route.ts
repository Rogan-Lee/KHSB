import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import { getMobileStaffSuggestions } from "@/lib/mobile-staff-suggestions";

/** 학생 건의사항 목록 (직원) — { items, summary: 상태별 건수 } */
export async function GET(request: NextRequest) {
  try {
    await requireMobileStaff(request);
    return mobileJson(await getMobileStaffSuggestions());
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
