import type { NextRequest } from "next/server";

import {
  MobileApiError,
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { answerMobileVocab } from "@/lib/mobile-vocab";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ attemptId: string }> },
) {
  try {
    const [student, { attemptId }, body] = await Promise.all([
      requireMobileStudent(request),
      context.params,
      request.json(),
    ]);
    const itemId = typeof body?.itemId === "string" ? body.itemId : "";
    const answer = typeof body?.answer === "string" ? body.answer : "";
    const timeMs = Number.isFinite(body?.timeMs) ? Number(body.timeMs) : 0;
    if (!itemId) throw new MobileApiError("문항 정보가 없습니다", 400);
    return mobileJson(
      await answerMobileVocab(student.id, attemptId, itemId, answer, timeMs),
    );
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
