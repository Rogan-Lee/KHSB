import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireParentChild,
} from "@/lib/mobile-auth";
import { getParentTasks } from "@/lib/mobile-parent-growth";

/** 학부모 성장 탭 · 과제 — 수행평가 진행 현황(상태별 개수 · 다가오는 마감). 제출물·피드백 본문은 보내지 않는다 — GET ?studentId= */
export async function GET(request: NextRequest) {
  try {
    const child = await requireParentChild(request, request.nextUrl.searchParams.get("studentId"));
    return mobileJson(await getParentTasks(child.id));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
