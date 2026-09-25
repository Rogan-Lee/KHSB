import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import { reissueStaffVocabAttempt } from "@/lib/mobile-staff-vocab";

// POST → { attempt } (새 링크·공유 문구 포함). 기존 링크와 진행 중 답안은 사라진다.
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ attemptId: string }> },
) {
  try {
    const [, { attemptId }] = await Promise.all([requireMobileStaff(request), context.params]);
    const result = await reissueStaffVocabAttempt(attemptId);
    revalidatePath("/vocab-test");
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
