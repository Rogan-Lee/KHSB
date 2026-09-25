import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireParentChild,
} from "@/lib/mobile-auth";
import { getParentExams } from "@/lib/mobile-parent-growth";

/** 학부모 성장 탭 · 성적 — 시험별 과목 등급 · 모의고사 등급 추이 · 과목별 변화 — GET ?studentId= */
export async function GET(request: NextRequest) {
  try {
    const child = await requireParentChild(request, request.nextUrl.searchParams.get("studentId"));
    return mobileJson(await getParentExams(child.id));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
