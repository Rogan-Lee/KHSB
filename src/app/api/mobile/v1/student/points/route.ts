import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { getMobileStudentPoints } from "@/lib/mobile-student-life";

/** 학생 포인트 — 잔액 + 통합 내역 + 기프티콘 상품 + 내 교환 신청 */
export async function GET(request: NextRequest) {
  try {
    const student = await requireMobileStudent(request);
    return mobileJson(await getMobileStudentPoints(student.id));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
