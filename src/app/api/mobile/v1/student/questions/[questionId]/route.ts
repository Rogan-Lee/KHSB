import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { getMobileStudentQuestion } from "@/lib/mobile-student-questions";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ questionId: string }> },
) {
  try {
    const [student, { questionId }] = await Promise.all([
      requireMobileStudent(request),
      context.params,
    ]);
    return mobileJson(await getMobileStudentQuestion(student.id, questionId));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
