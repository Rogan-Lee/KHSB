import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileAnyStaff,
} from "@/lib/mobile-auth";
import { checkStudentCommunication } from "@/lib/mobile-staff-ops";

// 확인 처리 — body { isChecked: true }. 학생 지시 받은함의 "확인만"도 이걸 써서 온라인 직원까지 허용 (웹 checkCommunication 과 같은 기준)
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ studentId: string; communicationId: string }> },
) {
  try {
    const [, { studentId, communicationId }, body] = await Promise.all([
      requireMobileAnyStaff(request),
      context.params,
      request.json(),
    ]);
    const result = await checkStudentCommunication(studentId, communicationId, body);
    revalidatePath(`/students/${studentId}`);
    revalidatePath("/attendance");
    revalidatePath("/instructions");
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
