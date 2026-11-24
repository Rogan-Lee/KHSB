import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { getEntryOnboarding } from "@/lib/mobile-student-onboarding";

export async function GET(request: NextRequest) {
  try {
    const student = await requireMobileStudent(request);
    return mobileJson(await getEntryOnboarding(student.id));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
