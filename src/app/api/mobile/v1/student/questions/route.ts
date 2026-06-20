import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { getStudentMobileQuestions } from "@/lib/mobile-data";

export async function GET(request: NextRequest) {
  try {
    const student = await requireMobileStudent(request);
    return mobileJson(await getStudentMobileQuestions(student.id));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
