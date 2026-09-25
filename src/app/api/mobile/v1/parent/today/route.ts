import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireParentChild,
} from "@/lib/mobile-auth";
import { getParentToday } from "@/lib/mobile-parent-attendance";

/** 학부모 홈 — 자녀의 오늘 출결·외출·쪽잠·휴대폰 제출 + 독서실 공지 */
export async function GET(request: NextRequest) {
  try {
    const child = await requireParentChild(
      request,
      request.nextUrl.searchParams.get("studentId"),
    );
    return mobileJson(await getParentToday(child));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
