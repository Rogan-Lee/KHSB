import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { finalizeMobileVocab } from "@/lib/mobile-vocab";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ attemptId: string }> },
) {
  try {
    const [student, { attemptId }] = await Promise.all([
      requireMobileStudent(request),
      context.params,
    ]);
    return mobileJson(await finalizeMobileVocab(student.id, attemptId));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
