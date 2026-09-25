import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { getMobileStudentHome } from "@/lib/mobile-student-home";

/** 학생 앱 홈·전체 탭 — 웹 학생 포털 홈/전체와 같은 데이터 */
export async function GET(request: NextRequest) {
  try {
    const student = await requireMobileStudent(request);
    return mobileJson(await getMobileStudentHome(student));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
