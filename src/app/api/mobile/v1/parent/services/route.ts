import type { NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson } from "@/lib/mobile-auth";
import {
  getParentServicesSummary,
  requireParentChildFromQuery,
} from "@/lib/mobile-parent-services";

/** 학부모 전체 탭 요약 — 도시락·등원 스케줄·모의고사·문의 상태 — GET ?studentId= */
export async function GET(request: NextRequest) {
  try {
    const { parent, child } = await requireParentChildFromQuery(request);
    return mobileJson(await getParentServicesSummary(parent.authUserId, child));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
