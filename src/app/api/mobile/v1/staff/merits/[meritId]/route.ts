import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import { deleteStaffMobileMerit } from "@/lib/mobile-staff-ops-merits";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ meritId: string }> },
) {
  try {
    const [, { meritId }] = await Promise.all([
      requireMobileStaff(request),
      context.params,
    ]);
    const result = await deleteStaffMobileMerit(meritId);
    revalidatePath("/merit-demerit");
    revalidatePath(`/students/${result.studentId}`);
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
