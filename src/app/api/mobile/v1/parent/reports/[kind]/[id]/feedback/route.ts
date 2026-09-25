import type { NextRequest } from "next/server";

import {
  MobileApiError,
  mobileApiErrorResponse,
  mobileJson,
  requireMobileParent,
} from "@/lib/mobile-auth";
import { submitParentOnlineReportFeedback } from "@/lib/mobile-parent-inquiries";

/**
 * 리포트 피드백 — POST /parent/reports/online/{id}/feedback { content }
 * 온라인 학습 리포트만 피드백 채널이 있다 (웹 공개 페이지 피드백과 같은 저장·Slack 알림).
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ kind: string; id: string }> },
) {
  try {
    const [parent, { kind, id }, body] = await Promise.all([
      requireMobileParent(request),
      context.params,
      request.json(),
    ]);
    if (kind !== "online") {
      throw new MobileApiError("이 리포트에는 의견을 남길 수 없어요", 404);
    }
    return mobileJson(
      await submitParentOnlineReportFeedback(parent.authUserId, parent.children, id, body),
    );
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
