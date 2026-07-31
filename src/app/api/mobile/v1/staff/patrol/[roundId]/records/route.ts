import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import { saveMobilePatrolRecord } from "@/lib/mobile-operations";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ roundId: string }> },
) {
  try {
    const [, { roundId }, body] = await Promise.all([
      requireMobileStaff(request),
      context.params,
      request.json(),
    ]);
    const result = await saveMobilePatrolRecord(roundId, body);
    revalidatePath("/");
    revalidatePath("/patrol");
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
