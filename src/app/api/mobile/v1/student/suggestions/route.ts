import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import {
  createMobileStudentSuggestion,
  getMobileStudentSuggestions,
} from "@/lib/mobile-suggestions";

export async function GET(request: NextRequest) {
  try {
    const student = await requireMobileStudent(request);
    return mobileJson(await getMobileStudentSuggestions(student.id));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const [student, body] = await Promise.all([
      requireMobileStudent(request),
      request.json(),
    ]);
    const result = await createMobileStudentSuggestion(
      { id: student.id, name: student.name, grade: student.grade },
      body,
    );
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
