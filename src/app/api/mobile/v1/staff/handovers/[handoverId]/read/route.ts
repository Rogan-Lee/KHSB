import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import { markMobileHandoverRead } from "@/lib/mobile-operations";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ handoverId: string }> },
) {
  try {
    const [user, { handoverId }] = await Promise.all([
      requireMobileStaff(request),
      context.params,
    ]);
    const result = await markMobileHandoverRead(
      { id: user.id, name: user.name },
      handoverId,
    );
    revalidatePath("/");
    revalidatePath("/handover");
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
