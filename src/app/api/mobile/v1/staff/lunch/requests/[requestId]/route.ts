import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { mobileApiErrorResponse, mobileJson, requireMobileStaff } from "@/lib/mobile-auth";
import { replyMobileLunchChangeRequest } from "@/lib/mobile-staff-lunch";

// POST { reply } — 학부모 변경 요청에 반영 내용 답변 (다시 보내면 수정)
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ requestId: string }> },
) {
  try {
    const [user, { requestId }, body] = await Promise.all([
      requireMobileStaff(request),
      context.params,
      request.json(),
    ]);
    const result = await replyMobileLunchChangeRequest(user, requestId, body);
    revalidatePath("/lunch");
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
