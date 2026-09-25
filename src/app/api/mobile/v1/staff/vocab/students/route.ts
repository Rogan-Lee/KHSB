import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import { getStaffVocabRoster } from "@/lib/mobile-staff-vocab";

// GET ?examId= — 배정용 재원생 목록 (이미 배정된 학생 표시)
export async function GET(request: NextRequest) {
  try {
    await requireMobileStaff(request);
    return mobileJson(
      await getStaffVocabRoster(request.nextUrl.searchParams.get("examId")),
    );
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
