import type { NextRequest } from "next/server";

import {
  MobileApiError,
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { requestStudentLunchChange } from "@/lib/mobile-student-lunch";

/** 확정된 도시락 변경 요청 — POST { message } */
export async function POST(request: NextRequest) {
  try {
    const student = await requireMobileStudent(request);
    const body = (await request.json().catch(() => {
      throw new MobileApiError("요청 형식을 확인하세요", 400);
    })) as unknown;
    return mobileJson(await requestStudentLunchChange(student, body));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
