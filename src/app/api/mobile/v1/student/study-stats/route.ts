import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { getParentStudyStats } from "@/lib/mobile-parent-attendance";

/** 학생 본인 공부 시간 통계 — 학부모 앱과 같은 계산(입실~퇴실 − 외출). ?range=week|month&date=YYYY-MM-DD */
export async function GET(request: NextRequest) {
  try {
    const student = await requireMobileStudent(request);
    const params = request.nextUrl.searchParams;
    return mobileJson(
      await getParentStudyStats(student, { range: params.get("range"), date: params.get("date") }),
    );
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
