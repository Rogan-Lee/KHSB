import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileParent,
} from "@/lib/mobile-auth";
import { rejectParentSchedule } from "@/lib/mobile-parent-schedule";

/** 등원 스케줄 수정 요청 — POST { content } (승인 전이면 반려, 반영 뒤면 의견만) */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ proposalId: string }> },
) {
  try {
    const [parent, { proposalId }, body] = await Promise.all([
      requireMobileParent(request),
      context.params,
      request.json(),
    ]);
    return mobileJson(await rejectParentSchedule(parent.children, proposalId, body));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
