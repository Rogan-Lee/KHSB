import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import { setMobileStaffQuestionStatus } from "@/lib/mobile-staff-questions";

/** 질문 상태 변경 — { status: "RESOLVED" | "OPEN" | "ARCHIVED" } (해결 처리 · 다시 열기 · 보관) */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ questionId: string }> },
) {
  try {
    const [, { questionId }, body] = await Promise.all([
      requireMobileStaff(request),
      context.params,
      request.json(),
    ]);
    const result = await setMobileStaffQuestionStatus(questionId, body);
    revalidatePath("/questions");
    revalidatePath(`/questions/${questionId}`);
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
