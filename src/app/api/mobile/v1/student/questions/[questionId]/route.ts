import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { getMobileStudentQuestionThread } from "@/lib/mobile-workflows";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ questionId: string }> },
) {
  try {
    const [student, { questionId }] = await Promise.all([
      requireMobileStudent(request),
      context.params,
    ]);
    return mobileJson(
      await getMobileStudentQuestionThread(student.id, questionId),
    );
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
