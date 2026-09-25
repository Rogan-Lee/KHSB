import type { NextRequest } from "next/server";

import {
  MobileApiError,
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { saveStudentLunchOrder } from "@/lib/mobile-student-lunch";

/** 도시락 신청·수정·취소 (미결제 주문 통째로 교체) — PUT { menuIds, memo? } */
export async function PUT(request: NextRequest) {
  try {
    const student = await requireMobileStudent(request);
    const body = (await request.json().catch(() => {
      throw new MobileApiError("요청 형식을 확인하세요", 400);
    })) as unknown;
    return mobileJson(await saveStudentLunchOrder(student, body));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
