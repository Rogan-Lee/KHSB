import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireParentChild,
} from "@/lib/mobile-auth";
import { listParentReports, parseReportKindFilter } from "@/lib/mobile-parent-reports";

/**
 * 학부모 리포트함 — 멘토링·월간·온라인 관리·공부 계획·상담 리포트 통합 목록.
 * GET ?studentId=&kind=(all|mentoring|monthly|online|study-plan|consultation)
 * 응답의 `items` 는 구버전 앱 호환(만료 전 멘토링 리포트 + 웹 URL), 새 앱은 `reports` 를 쓴다.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const child = await requireParentChild(request, params.get("studentId"));
    const kind = parseReportKindFilter(params.get("kind"));
    return mobileJson(await listParentReports(child.id, kind));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
