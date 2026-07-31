import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { getMobileVocabResult } from "@/lib/mobile-vocab";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ attemptId: string }> },
) {
  try {
    const [student, { attemptId }] = await Promise.all([
      requireMobileStudent(request),
      context.params,
    ]);
    return mobileJson(await getMobileVocabResult(student.id, attemptId));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
