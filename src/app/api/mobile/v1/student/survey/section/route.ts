import type { NextRequest } from "next/server";

import {
  MobileApiError,
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { saveMobileSurveySection } from "@/lib/mobile-survey";

export async function POST(request: NextRequest) {
  try {
    const [student, body] = await Promise.all([
      requireMobileStudent(request),
      request.json(),
    ]);
    const sectionKey =
      typeof body?.sectionKey === "string" ? body.sectionKey : "";
    if (!sectionKey) throw new MobileApiError("섹션 정보가 없습니다", 400);
    return mobileJson(
      await saveMobileSurveySection(
        { id: student.id, grade: student.grade },
        sectionKey,
        body?.value,
      ),
    );
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
