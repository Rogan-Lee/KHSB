import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import {
  getMobilePatrolData,
  updateMobilePatrolRound,
} from "@/lib/mobile-operations";

export async function GET(request: NextRequest) {
  try {
    const user = await requireMobileStaff(request);
    return mobileJson(await getMobilePatrolData(user.name));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const [user, body] = await Promise.all([
      requireMobileStaff(request),
      request.json(),
    ]);
    const result = await updateMobilePatrolRound(
      { id: user.id, name: user.name },
      body,
    );
    revalidatePath("/");
    revalidatePath("/patrol");
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
