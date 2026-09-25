import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import { getStaffVocabExam } from "@/lib/mobile-staff-vocab";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ examId: string }> },
) {
  try {
    const [, { examId }] = await Promise.all([requireMobileStaff(request), context.params]);
    return mobileJson(await getStaffVocabExam(examId));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
