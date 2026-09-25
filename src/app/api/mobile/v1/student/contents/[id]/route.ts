import type { NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson, requireMobileStudent } from "@/lib/mobile-auth";
import { getStudentContent } from "@/lib/mobile-student-contents";

/** 학생 콘텐츠 상세 (공개 글만, 본문은 앱용 마크다운) — GET */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireMobileStudent(request);
    const { id } = await params;
    return mobileJson(await getStudentContent(id));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
