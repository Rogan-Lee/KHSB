import { after, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileAnyStaff,
} from "@/lib/mobile-auth";
import { notifyStudentOfTaskFeedback } from "@/lib/mobile-push";
import { createMobileTaskFeedback } from "@/lib/mobile-tasks";

// 작성 권한은 capabilities.writeFeedback + 담당 학생 여부로 createMobileTaskFeedback 가 검사
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ submissionId: string }> },
) {
  try {
    const [user, { submissionId }, body] = await Promise.all([
      requireMobileAnyStaff(request),
      context.params,
      request.json(),
    ]);
    const result = await createMobileTaskFeedback(
      { id: user.id, role: user.role },
      submissionId,
      body,
    );
    revalidatePath("/online/performance");
    revalidatePath(`/online/students/${result.studentId}/tasks`);
    revalidatePath(`/online/students/${result.studentId}/tasks/${result.taskId}`);
    after(() =>
      notifyStudentOfTaskFeedback({
        status: result.status,
        submissionId,
      }),
    );
    return mobileJson({ ok: result.ok, status: result.status });
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
