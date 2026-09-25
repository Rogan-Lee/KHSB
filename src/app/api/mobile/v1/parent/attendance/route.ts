import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireParentChild,
} from "@/lib/mobile-auth";
import { getParentAttendanceMonth } from "@/lib/mobile-parent-attendance";

/**
 * 학부모 — 월간 출결. ?studentId&month=YYYY-MM
 * items[] 의 기존 필드(date·status·type·checkIn·checkOut)는 그대로 두고
 * 외출·지각·공부 시간·예정 시간과 월 요약(summary)을 덧붙였다.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const child = await requireParentChild(request, params.get("studentId"));
    return mobileJson(await getParentAttendanceMonth(child, params.get("month")));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
