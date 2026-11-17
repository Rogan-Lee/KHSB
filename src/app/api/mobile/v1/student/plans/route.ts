import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { getStudentPlansRange, saveMobileStudentPlans } from "@/lib/mobile-student-plan";

/** 공부 플래너 — 기간 계획. ?from&to=YYYY-MM-DD (없으면 이번 주, 최대 42일) */
export async function GET(request: NextRequest) {
  try {
    const student = await requireMobileStudent(request);
    const params = request.nextUrl.searchParams;
    return mobileJson(await getStudentPlansRange(student.id, params.get("from"), params.get("to")));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

/** 여러 날 계획 저장 — PUT { days: [{ date, items }] } (날짜마다 항목 전체 교체, 지난 7일~4주 뒤) */
export async function PUT(request: NextRequest) {
  try {
    const [student, body] = await Promise.all([requireMobileStudent(request), request.json()]);
    return mobileJson(await saveMobileStudentPlans(student.id, body));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
