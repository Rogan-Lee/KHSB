import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { getMobileStudentFeedbacks } from "@/lib/mobile-feedback";

export async function GET(request: NextRequest) {
  try {
    const student = await requireMobileStudent(request);
    return mobileJson(await getMobileStudentFeedbacks(student.id));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
