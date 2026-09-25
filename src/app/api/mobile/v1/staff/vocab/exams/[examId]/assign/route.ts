import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import { assignStaffVocabExam } from "@/lib/mobile-staff-vocab";

// POST { studentIds } → { added, skipped }
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ examId: string }> },
) {
  try {
    const [user, { examId }, body] = await Promise.all([
      requireMobileStaff(request),
      context.params,
      request.json(),
    ]);
    const result = await assignStaffVocabExam({ id: user.id }, examId, body);
    revalidatePath("/vocab-test");
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
