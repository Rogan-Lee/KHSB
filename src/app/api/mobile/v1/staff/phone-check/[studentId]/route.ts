import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import { setStaffPhoneCheck } from "@/lib/mobile-staff-ops-phone";

// body { date, status: SUBMITTED|NOT_SUBMITTED|ABSENT|EXEMPT, note? }
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ studentId: string }> },
) {
  try {
    const [user, { studentId }, body] = await Promise.all([
      requireMobileStaff(request),
      context.params,
      request.json(),
    ]);
    const result = await setStaffPhoneCheck(studentId, body, user.id);
    revalidatePath("/phone-check");
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
