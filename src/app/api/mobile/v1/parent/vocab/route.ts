import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireParentChild,
} from "@/lib/mobile-auth";
import { getParentVocab } from "@/lib/mobile-parent-growth";

/** 학부모 성장 탭 · 영단어 — 종이 시험(VocabTestScore) + 온라인 시험(VocabAttempt) 통합 — GET ?studentId= */
export async function GET(request: NextRequest) {
  try {
    const child = await requireParentChild(request, request.nextUrl.searchParams.get("studentId"));
    return mobileJson(await getParentVocab(child.id));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
