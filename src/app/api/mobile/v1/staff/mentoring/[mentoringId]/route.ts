import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import {
  completeMobileMentoring,
  getMobileMentoringRecord,
} from "@/lib/mobile-workflows";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ mentoringId: string }> },
) {
  try {
    const [user, { mentoringId }] = await Promise.all([
      requireMobileStaff(request),
      context.params,
    ]);
    return mobileJson(
      await getMobileMentoringRecord(mentoringId, user.id, user.role),
    );
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ mentoringId: string }> },
) {
  try {
    const [user, { mentoringId }, body] = await Promise.all([
      requireMobileStaff(request),
      context.params,
      request.json(),
    ]);
    const result = await completeMobileMentoring(
      mentoringId,
      user.id,
      user.role,
      body,
    );
    revalidatePath("/mentoring");
    revalidatePath(`/mentoring/${mentoringId}`);
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
