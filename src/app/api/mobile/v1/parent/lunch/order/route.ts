import type { NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson } from "@/lib/mobile-auth";
import { saveParentLunchOrder } from "@/lib/mobile-parent-lunch";
import { requireParentChildFromBody } from "@/lib/mobile-parent-services";

/** 도시락 신청·수정·취소 (미결제 주문 통째로 교체) — PUT { studentId, menuIds, memo? } */
export async function PUT(request: NextRequest) {
  try {
    const { child, body } = await requireParentChildFromBody(request);
    return mobileJson(await saveParentLunchOrder(child, body));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
