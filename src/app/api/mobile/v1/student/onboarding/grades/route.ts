import type { NextRequest } from "next/server";

import {
  MobileApiError,
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { saveEntryGrades } from "@/lib/mobile-student-onboarding";
import { parseEntryGrades } from "@/lib/onboarding/entry-validate";

export async function PUT(request: NextRequest) {
  try {
    const student = await requireMobileStudent(request);
    // JSON 이 깨졌으면 SyntaxError → mobileApiErrorResponse 가 400
    const parsed = parseEntryGrades(await request.json());
    if (!parsed.ok) throw new MobileApiError(parsed.error, 400);
    return mobileJson(await saveEntryGrades(student.id, parsed.value));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
