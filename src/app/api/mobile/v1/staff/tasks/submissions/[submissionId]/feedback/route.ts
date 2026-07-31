import { after, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileOnlineStaff,
} from "@/lib/mobile-auth";
import { notifyStudentOfTaskFeedback } from "@/lib/mobile-push";
import { createMobileTaskFeedback } from "@/lib/mobile-tasks";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ submissionId: string }> },
) {
  try {
    const [user, { submissionId }, body] = await Promise.all([
      requireMobileOnlineStaff(request),
      context.params,
      request.json(),
    ]);
    const result = await createMobileTaskFeedback(
      { id: user.id, role: user.role },
      submissionId,
      body,
    );
    revalidatePath("/online/performance");
    after(() =>
      notifyStudentOfTaskFeedback({
        status: result.status,
        submissionId,
      }),
    );
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
