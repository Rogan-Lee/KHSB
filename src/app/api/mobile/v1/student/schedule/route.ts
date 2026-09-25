import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { getMobileStudentSchedule } from "@/lib/mobile-student-plan";

/** 내 일정 — 이번 주 시간표·일정 + 오늘/내일 공부 계획 + 적용 중인 등원 스케줄 + 제출 이력 — GET */
export async function GET(request: NextRequest) {
  try {
    const student = await requireMobileStudent(request);
    return mobileJson(await getMobileStudentSchedule(student));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
