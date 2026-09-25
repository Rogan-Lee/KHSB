import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileParent,
} from "@/lib/mobile-auth";
import { getParentMonthlyReport } from "@/lib/mobile-parent-monthly-report";
import { getParentReportDetail, parseReportKind } from "@/lib/mobile-parent-reports";

/**
 * 학부모 리포트 본문 — 앱이 네이티브로 그린다 (웹 링크·WebView 없음).
 * GET /parent/reports/{mentoring|monthly|online|study-plan|consultation}/{id}
 * 발행된(발송·미취소) + 연결된 (활성) 자녀의 리포트만. 웹 공유 토큰·링크 만료와는 무관, 그 밖엔 404.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ kind: string; id: string }> },
) {
  try {
    const [parent, params] = await Promise.all([requireMobileParent(request), context.params]);
    const kind = parseReportKind(params.kind);

    // 월간 리포트 본문은 월간 리포트 모듈 (같은 규칙: sentAt + 자녀 소유 확인)
    if (kind === "monthly") return mobileJson(await getParentMonthlyReport(parent, params.id));

    return mobileJson(
      await getParentReportDetail(parent, kind, params.id, {
        ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
        ua: request.headers.get("user-agent"),
      }),
    );
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
