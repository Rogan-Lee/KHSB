import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireParentChild,
} from "@/lib/mobile-auth";
import { getStudentPlansRange } from "@/lib/mobile-student-plan";

/** 학부모 — 자녀 공부 계획(읽기 전용). ?studentId&from&to=YYYY-MM-DD (없으면 이번 주) */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const child = await requireParentChild(request, params.get("studentId"));
    return mobileJson(await getStudentPlansRange(child.id, params.get("from"), params.get("to")));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
