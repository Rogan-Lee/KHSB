import type { NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson } from "@/lib/mobile-auth";
import { getParentNotices } from "@/lib/mobile-parent-notices";
import { requireParentChildFromQuery } from "@/lib/mobile-parent-services";

/** 공지사항 — 학부모 공지 + 운영 안내 + 자녀 학년 입시 정보 — GET ?studentId= */
export async function GET(request: NextRequest) {
  try {
    const { child } = await requireParentChildFromQuery(request);
    return mobileJson(await getParentNotices(child));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
