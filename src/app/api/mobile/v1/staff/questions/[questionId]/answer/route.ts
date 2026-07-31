import { after, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import { notifyStudentOfAnswer } from "@/lib/mobile-push";
import { answerMobileStudentQuestion } from "@/lib/mobile-workflows";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ questionId: string }> },
) {
  try {
    const [user, { questionId }, body] = await Promise.all([
      requireMobileStaff(request),
      context.params,
      request.json(),
    ]);
    const result = await answerMobileStudentQuestion(
      user.id,
      questionId,
      body,
    );
    revalidatePath("/questions");
    revalidatePath(`/questions/${questionId}`);
    after(() => notifyStudentOfAnswer({ questionId }));
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
