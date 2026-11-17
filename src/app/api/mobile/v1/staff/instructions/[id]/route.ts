import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson, requireMobileAnyStaff } from "@/lib/mobile-auth";
import { discardInstructionDraft } from "@/lib/student-instructions";

/** AI 초안 버리기 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const [, { id }] = await Promise.all([requireMobileAnyStaff(request), context.params]);
    const result = await discardInstructionDraft(id);
    revalidatePath("/instructions");
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
