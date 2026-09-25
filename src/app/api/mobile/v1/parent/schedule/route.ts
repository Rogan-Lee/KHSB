import type { NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson } from "@/lib/mobile-auth";
import { getParentSchedule } from "@/lib/mobile-parent-schedule";
import { requireParentChildFromQuery } from "@/lib/mobile-parent-services";

/** 등원 스케줄 — 현재 스케줄 + 승인 대기 제안 + 최근 처리된 제안 — GET ?studentId= */
export async function GET(request: NextRequest) {
  try {
    const { child } = await requireParentChildFromQuery(request);
    return mobileJson(await getParentSchedule(child));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
