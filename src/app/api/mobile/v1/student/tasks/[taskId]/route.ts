import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { getMobileStudentTask } from "@/lib/mobile-tasks";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ taskId: string }> },
) {
  try {
    const [student, { taskId }] = await Promise.all([
      requireMobileStudent(request),
      context.params,
    ]);
    return mobileJson(await getMobileStudentTask(student.id, taskId));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
