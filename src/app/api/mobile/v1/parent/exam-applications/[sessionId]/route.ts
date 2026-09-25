import type { NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson } from "@/lib/mobile-auth";
import { applyParentExam, cancelParentExam } from "@/lib/mobile-parent-exams";
import {
  requireParentChildFromBody,
  requireParentChildFromQuery,
} from "@/lib/mobile-parent-services";

type Context = { params: Promise<{ sessionId: string }> };

/** 모의고사 신청(재신청) — POST { studentId, memo? } */
export async function POST(request: NextRequest, context: Context) {
  try {
    const [{ child, body }, { sessionId }] = await Promise.all([
      requireParentChildFromBody(request),
      context.params,
    ]);
    return mobileJson(await applyParentExam(child, sessionId, body));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

/** 신청 취소 — DELETE ?studentId= (확정된 신청은 운영진 문의) */
export async function DELETE(request: NextRequest, context: Context) {
  try {
    const [{ child }, { sessionId }] = await Promise.all([
      requireParentChildFromQuery(request),
      context.params,
    ]);
    return mobileJson(await cancelParentExam(child, sessionId));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
