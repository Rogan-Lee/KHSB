import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import { getMobileStaffQuestionThread } from "@/lib/mobile-workflows";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ questionId: string }> },
) {
  try {
    const [, { questionId }] = await Promise.all([
      requireMobileStaff(request),
      context.params,
    ]);
    return mobileJson(await getMobileStaffQuestionThread(questionId));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
