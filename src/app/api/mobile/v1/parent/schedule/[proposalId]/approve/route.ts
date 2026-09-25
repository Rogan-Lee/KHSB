import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileParent,
} from "@/lib/mobile-auth";
import { approveParentSchedule } from "@/lib/mobile-parent-schedule";

/** 등원 스케줄 승인 — POST (자녀 소유 여부는 제안의 학생으로 검증) */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ proposalId: string }> },
) {
  try {
    const [parent, { proposalId }] = await Promise.all([
      requireMobileParent(request),
      context.params,
    ]);
    return mobileJson(await approveParentSchedule(parent.children, proposalId));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
