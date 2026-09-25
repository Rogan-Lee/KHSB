import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { requestMobileStudentRedemption } from "@/lib/mobile-student-life";

/** 기프티콘 교환 신청 — body { itemId, note? } → { id } */
export async function POST(request: NextRequest) {
  try {
    const [student, body] = await Promise.all([
      requireMobileStudent(request),
      request.json(),
    ]);
    return mobileJson(
      await requestMobileStudentRedemption(
        { id: student.id, name: student.name, grade: student.grade },
        body,
      ),
    );
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
