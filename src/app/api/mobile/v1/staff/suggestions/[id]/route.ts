import { revalidatePath } from "next/cache";
import { after, type NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import {
  sendSuggestionPush,
  updateMobileStaffSuggestion,
} from "@/lib/mobile-staff-suggestions";

/** 건의 상태·답변 저장 — { status?, reply? } (숨김·삭제는 웹 원장 전용) */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const [user, { id }, body] = await Promise.all([
      requireMobileStaff(request),
      context.params,
      request.json(),
    ]);
    const { item, push } = await updateMobileStaffSuggestion(
      { id: user.id, name: user.name },
      id,
      body,
    );
    revalidatePath("/suggestions");
    revalidatePath("/");
    after(() => sendSuggestionPush(push));
    return mobileJson({ ok: true, item });
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
