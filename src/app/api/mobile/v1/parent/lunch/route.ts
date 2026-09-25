import type { NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson } from "@/lib/mobile-auth";
import { getParentLunch } from "@/lib/mobile-parent-lunch";
import { requireParentChildFromQuery } from "@/lib/mobile-parent-services";

/** 학부모 도시락 — 메뉴·신청·입금·변경 요청 상태 — GET ?studentId= */
export async function GET(request: NextRequest) {
  try {
    const { child } = await requireParentChildFromQuery(request);
    return mobileJson(await getParentLunch(child));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
