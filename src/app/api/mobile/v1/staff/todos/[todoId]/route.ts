import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { mobileApiErrorResponse, mobileJson, requireMobileAnyStaff } from "@/lib/mobile-auth";
import { setMobileTodoCompleted } from "@/lib/mobile-staff-home";

// PATCH { completed: boolean } — 내 할 일 완료/해제
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ todoId: string }> },
) {
  try {
    const [user, { todoId }, body] = await Promise.all([
      requireMobileAnyStaff(request),
      context.params,
      request.json(),
    ]);
    const result = await setMobileTodoCompleted(user, todoId, body);
    revalidatePath("/todos");
    revalidatePath("/");
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
