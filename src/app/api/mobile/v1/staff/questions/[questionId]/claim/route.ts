import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import {
  claimMobileStaffQuestion,
  releaseMobileStaffQuestion,
} from "@/lib/mobile-staff-questions";

type Context = { params: Promise<{ questionId: string }> };

function revalidate(questionId: string) {
  revalidatePath("/questions");
  revalidatePath(`/questions/${questionId}`);
}

/** 답변 담당 잡기 (다른 직원이 잡은 질문도 가져올 수 있음 — previousClaimerName 으로 안내) */
export async function POST(request: NextRequest, context: Context) {
  try {
    const [user, { questionId }] = await Promise.all([
      requireMobileStaff(request),
      context.params,
    ]);
    const result = await claimMobileStaffQuestion(user.id, questionId);
    revalidate(questionId);
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

/** 담당 해제 */
export async function DELETE(request: NextRequest, context: Context) {
  try {
    const [, { questionId }] = await Promise.all([
      requireMobileStaff(request),
      context.params,
    ]);
    const result = await releaseMobileStaffQuestion(questionId);
    revalidate(questionId);
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
