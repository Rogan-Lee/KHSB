import { after, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { notifyAssignedStaffOfTaskSubmission } from "@/lib/mobile-push";
import { submitMobileStudentTask } from "@/lib/mobile-tasks";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ taskId: string }> },
) {
  try {
    const [student, { taskId }, body] = await Promise.all([
      requireMobileStudent(request),
      context.params,
      request.json(),
    ]);
    const result = await submitMobileStudentTask(
      { id: student.id, name: student.name },
      taskId,
      body,
    );
    revalidatePath("/online/performance");
    revalidatePath(`/online/students/${student.id}/tasks`);
    after(() =>
      notifyAssignedStaffOfTaskSubmission({
        taskId,
        version: result.version,
      }),
    );
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
