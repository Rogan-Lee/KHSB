import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import { getStaffMentoringSchedule } from "@/lib/mobile-staff-mentoring";

// GET ?range=today|week — 오늘/이번 주 멘토링 일정 + 밀린 기록
export async function GET(request: NextRequest) {
  try {
    const user = await requireMobileStaff(request);
    return mobileJson(
      await getStaffMentoringSchedule(
        { id: user.id, role: user.role },
        request.nextUrl.searchParams.get("range"),
      ),
    );
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
