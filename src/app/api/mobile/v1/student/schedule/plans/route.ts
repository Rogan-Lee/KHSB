import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { saveMobileStudentPlan } from "@/lib/mobile-student-plan";

/** 오늘/내일 공부 계획 저장(항목 전체 교체) — PUT { date: "YYYY-MM-DD", items } */
export async function PUT(request: NextRequest) {
  try {
    const [student, body] = await Promise.all([requireMobileStudent(request), request.json()]);
    return mobileJson(await saveMobileStudentPlan(student.id, body));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
