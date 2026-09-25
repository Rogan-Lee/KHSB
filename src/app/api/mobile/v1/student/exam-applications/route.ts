import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { getMobileStudentExams } from "@/lib/mobile-student-plan";

/** 모의고사 신청 — 접수 중 시험 + 본인이 신청·배정된 다가오는 시험 — GET */
export async function GET(request: NextRequest) {
  try {
    const student = await requireMobileStudent(request);
    return mobileJson(await getMobileStudentExams(student.id));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
