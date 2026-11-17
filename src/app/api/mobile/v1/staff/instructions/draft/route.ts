import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { MobileApiError, mobileApiErrorResponse, mobileJson, requireMobileAnyStaff } from "@/lib/mobile-auth";
import { parseMobileBody } from "@/lib/mobile-parent-services";
import { draftInstructionFromRequest } from "@/lib/student-instructions";

const schema = z.object({ requestId: z.string().min(1, "학부모 요청을 골라 주세요") });

/** AI 초안 다시 만들기 — POST { requestId } → { draft } */
export async function POST(request: NextRequest) {
  try {
    const [, body] = await Promise.all([requireMobileAnyStaff(request), request.json()]);
    const { requestId } = parseMobileBody(schema, body);
    const draft = await draftInstructionFromRequest(requestId, { force: true });
    if (!draft) throw new MobileApiError("AI가 이 요청에서 학생에게 줄 지시를 찾지 못했어요. 직접 적어 주세요", 422);
    revalidatePath("/instructions");
    return mobileJson({ draft });
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
