import type { NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson } from "@/lib/mobile-auth";
import { getParentExams } from "@/lib/mobile-parent-exams";
import { requireParentChildFromQuery } from "@/lib/mobile-parent-services";

/** 모의고사 신청 — 접수 중 시험 + 자녀가 신청·배정된 다가오는 시험 — GET ?studentId= */
export async function GET(request: NextRequest) {
  try {
    const { child } = await requireParentChildFromQuery(request);
    return mobileJson(await getParentExams(child));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
