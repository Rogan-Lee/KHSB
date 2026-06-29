import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import {
  getMobileStaffOperations,
  updateMobileClock,
} from "@/lib/mobile-operations";

export async function GET(request: NextRequest) {
  try {
    const user = await requireMobileStaff(request);
    return mobileJson(await getMobileStaffOperations(user.id));
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
    const result = await updateMobileClock(user.id, body);
    revalidatePath("/");
    revalidatePath("/payroll");
    revalidatePath("/payroll/me");
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
