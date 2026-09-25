import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { submitMobileStudentScheduleProposal } from "@/lib/mobile-student-plan";

/** 등원 스케줄 제출(새 버전) — POST { attendance, outings, memo? } → { id, version } */
export async function POST(request: NextRequest) {
  try {
    const [student, body] = await Promise.all([requireMobileStudent(request), request.json()]);
    return mobileJson(await submitMobileStudentScheduleProposal(student.id, body));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
