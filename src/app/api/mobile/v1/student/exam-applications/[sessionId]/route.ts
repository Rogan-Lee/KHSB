import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import {
  applyMobileStudentExam,
  cancelMobileStudentExam,
} from "@/lib/mobile-student-plan";

type Context = { params: Promise<{ sessionId: string }> };

/** 모의고사 신청(재신청) — POST { memo? } */
export async function POST(request: NextRequest, context: Context) {
  try {
    const [student, { sessionId }, body] = await Promise.all([
      requireMobileStudent(request),
      context.params,
      request.json().catch(() => ({})),
    ]);
    return mobileJson(await applyMobileStudentExam(student, sessionId, body));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

/** 신청 취소 — DELETE (확정된 신청은 운영진 문의) */
export async function DELETE(request: NextRequest, context: Context) {
  try {
    const [student, { sessionId }] = await Promise.all([
      requireMobileStudent(request),
      context.params,
    ]);
    return mobileJson(await cancelMobileStudentExam(student.id, sessionId));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
