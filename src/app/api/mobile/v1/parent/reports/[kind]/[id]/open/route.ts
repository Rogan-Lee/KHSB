import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileParent,
} from "@/lib/mobile-auth";
import { openParentReport, parseReportKind } from "@/lib/mobile-parent-reports";

/**
 * 앱 안에서 리포트 열기 — 휴대폰 번호 입력 없이.
 * 연결된 자녀의 리포트인지 확인한 뒤 1회용(60초) 핸드오프 URL 을 돌려준다.
 * 웹 링크가 만료된 리포트는 { mode: "native" } → 앱이 요약 화면(GET …/[kind]/[id])을 그린다.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ kind: string; id: string }> },
) {
  try {
    const [parent, { kind, id }] = await Promise.all([
      requireMobileParent(request),
      context.params,
    ]);
    return mobileJson(await openParentReport(parent, parseReportKind(kind), id));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
