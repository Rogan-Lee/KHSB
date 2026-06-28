import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { submitMobileSurvey } from "@/lib/mobile-survey";

export async function POST(request: NextRequest) {
  try {
    const student = await requireMobileStudent(request);
    return mobileJson(
      await submitMobileSurvey({
        id: student.id,
        grade: student.grade,
        name: student.name,
      }),
    );
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
