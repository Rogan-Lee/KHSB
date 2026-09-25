import type { NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson } from "@/lib/mobile-auth";
import { requestParentLunchChange } from "@/lib/mobile-parent-lunch";
import { requireParentChildFromBody } from "@/lib/mobile-parent-services";

/** 확정된 도시락 변경 요청 — POST { studentId, message } */
export async function POST(request: NextRequest) {
  try {
    const { child, body } = await requireParentChildFromBody(request);
    return mobileJson(await requestParentLunchChange(child, body));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
