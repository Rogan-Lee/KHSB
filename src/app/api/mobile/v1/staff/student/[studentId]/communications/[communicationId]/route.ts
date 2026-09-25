import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import { checkStudentCommunication } from "@/lib/mobile-staff-ops";

// 확인 처리 — body { isChecked: true }
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ studentId: string; communicationId: string }> },
) {
  try {
    const [, { studentId, communicationId }, body] = await Promise.all([
      requireMobileStaff(request),
      context.params,
      request.json(),
    ]);
    const result = await checkStudentCommunication(studentId, communicationId, body);
    revalidatePath(`/students/${studentId}`);
    revalidatePath("/attendance");
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
