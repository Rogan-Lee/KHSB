import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { getTimerSummary, timerAction } from "@/lib/study-sessions";

/** 공부 타이머 — 진행 중 기록 + 오늘 합계(과목별) */
export async function GET(request: NextRequest) {
  try {
    const student = await requireMobileStudent(request);
    return mobileJson(await getTimerSummary(student.id));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

/** POST { action: "start", subject? } · { action: "stop" } · { action: "keep" } — 응답은 GET 과 같다 */
export async function POST(request: NextRequest) {
  try {
    const [student, body] = await Promise.all([requireMobileStudent(request), request.json()]);
    return mobileJson(await timerAction(student.id, body));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
