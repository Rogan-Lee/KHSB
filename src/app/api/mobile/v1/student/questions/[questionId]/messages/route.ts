import { after, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { notifyAssignedStaffOfQuestion } from "@/lib/mobile-push";
import { addMobileStudentQuestionReply } from "@/lib/mobile-student-questions";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ questionId: string }> },
) {
  try {
    const [student, { questionId }, body] = await Promise.all([
      requireMobileStudent(request),
      context.params,
      request.json(),
    ]);
    const result = await addMobileStudentQuestionReply(
      { id: student.id, name: student.name },
      questionId,
      body,
    );
    revalidatePath("/questions");
    revalidatePath(`/questions/${questionId}`);
    after(() => notifyAssignedStaffOfQuestion({ questionId }));
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
