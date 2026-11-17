import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireParentChild,
} from "@/lib/mobile-auth";
import { getTimerSummary } from "@/lib/study-sessions";

/** 학부모 — 자녀 공부 타이머(지금 공부 중인지 + 오늘 과목별 합계). ?studentId */
export async function GET(request: NextRequest) {
  try {
    const child = await requireParentChild(request, request.nextUrl.searchParams.get("studentId"));
    return mobileJson(await getTimerSummary(child.id));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
