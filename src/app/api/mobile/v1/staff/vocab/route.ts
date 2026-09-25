import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import { getStaffVocabOverview } from "@/lib/mobile-staff-vocab";

// 영단어 시험 — 최근 응시·시험 목록·요약 (웹 /vocab-test 와 같은 권한: 오프라인 운영진)
export async function GET(request: NextRequest) {
  try {
    await requireMobileStaff(request);
    return mobileJson(await getStaffVocabOverview());
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
