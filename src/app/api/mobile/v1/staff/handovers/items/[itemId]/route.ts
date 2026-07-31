import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import { toggleMobileHandoverItem } from "@/lib/mobile-operations";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ itemId: string }> },
) {
  try {
    const [user, { itemId }, body] = await Promise.all([
      requireMobileStaff(request),
      context.params,
      request.json(),
    ]);
    const result = await toggleMobileHandoverItem(
      { id: user.id, name: user.name },
      itemId,
      body,
    );
    revalidatePath("/");
    revalidatePath("/handover");
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
