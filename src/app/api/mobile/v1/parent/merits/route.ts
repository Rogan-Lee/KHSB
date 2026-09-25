import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireParentChild,
} from "@/lib/mobile-auth";
import { getParentMerits } from "@/lib/mobile-parent-growth";

/** 학부모 성장 탭 · 생활 — 리포트 공개(visibleInReport) 상벌점·원생 기록을 달별로. 누적 잔액은 보내지 않는다 — GET ?studentId= */
export async function GET(request: NextRequest) {
  try {
    const child = await requireParentChild(request, request.nextUrl.searchParams.get("studentId"));
    return mobileJson(await getParentMerits(child.id));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
