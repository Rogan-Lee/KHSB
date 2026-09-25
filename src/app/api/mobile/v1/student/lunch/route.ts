import type { NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson, requireMobileStudent } from "@/lib/mobile-auth";
import { getStudentLunch } from "@/lib/mobile-student-lunch";

/** 학생 도시락 — 메뉴·신청·입금·변경 요청 상태 (학부모 /parent/lunch 와 같은 모양) — GET */
export async function GET(request: NextRequest) {
  try {
    const student = await requireMobileStudent(request);
    return mobileJson(await getStudentLunch(student));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
