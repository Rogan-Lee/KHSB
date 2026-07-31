import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import { updateMobileAttendance } from "@/lib/mobile-workflows";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ studentId: string }> },
) {
  try {
    const [, { studentId }, body] = await Promise.all([
      requireMobileStaff(request),
      context.params,
      request.json(),
    ]);
    const result = await updateMobileAttendance(studentId, body);
    revalidatePath("/attendance");
    revalidatePath(`/students/${studentId}`);
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
