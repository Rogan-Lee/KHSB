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
    const [user, { questionId }] = await Promise.all([
      requireMobileStaff(request),
      context.params,
    ]);
    return mobileJson(await getMobileStaffQuestionThread(questionId, user.id));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
