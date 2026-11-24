import type { NextRequest } from "next/server";

import {
  MobileApiError,
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { saveEntryMentor } from "@/lib/mobile-student-onboarding";
import { MENTOR_QUESTIONS } from "@/lib/onboarding/entry";
import { parseEntryMentor } from "@/lib/onboarding/entry-validate";

export async function PUT(request: NextRequest) {
  try {
    const student = await requireMobileStudent(request);
    // JSON 이 깨졌으면 SyntaxError → mobileApiErrorResponse 가 400
    const parsed = parseEntryMentor(await request.json(), MENTOR_QUESTIONS);
    if (!parsed.ok) throw new MobileApiError(parsed.error, 400);
    return mobileJson(await saveEntryMentor(student.id, parsed.value));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
