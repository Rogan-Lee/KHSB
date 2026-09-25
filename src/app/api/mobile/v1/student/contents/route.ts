import type { NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson, requireMobileStudent } from "@/lib/mobile-auth";
import { getStudentContents } from "@/lib/mobile-student-contents";

/** 학생 콘텐츠 목록 (공개 글 최신순 50개) — GET */
export async function GET(request: NextRequest) {
  try {
    await requireMobileStudent(request);
    return mobileJson(await getStudentContents());
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
