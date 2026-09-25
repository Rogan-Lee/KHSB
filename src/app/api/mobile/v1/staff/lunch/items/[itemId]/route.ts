import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { mobileApiErrorResponse, mobileJson, requireMobileStaff } from "@/lib/mobile-auth";
import { setMobileLunchItemReceived } from "@/lib/mobile-staff-lunch";

// PATCH { received: boolean } — 도시락 수령(배부) 체크
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ itemId: string }> },
) {
  try {
    const [, { itemId }, body] = await Promise.all([
      requireMobileStaff(request),
      context.params,
      request.json(),
    ]);
    const result = await setMobileLunchItemReceived(itemId, body);
    revalidatePath("/lunch");
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
