import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { getMobileSurvey } from "@/lib/mobile-survey";

export async function GET(request: NextRequest) {
  try {
    const student = await requireMobileStudent(request);
    return mobileJson(
      await getMobileSurvey({ id: student.id, grade: student.grade }),
    );
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
