import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireParentChild,
} from "@/lib/mobile-auth";
import { getParentStudyStats } from "@/lib/mobile-parent-attendance";

/** 학부모 — 공부 시간 통계. ?studentId&range=week|month&date=YYYY-MM-DD(기간 안 아무 날, 기본 오늘) */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const child = await requireParentChild(request, params.get("studentId"));
    return mobileJson(
      await getParentStudyStats(child, {
        range: params.get("range"),
        date: params.get("date"),
      }),
    );
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
