"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/react";

// 토큰(매직링크·리포트·초대 등)이 경로/쿼리에 실리는 공개 페이지 — 분석 도구로 토큰이 새지 않도록 가린다.
// /r/monthly/<t>, /r/online/<t>, /r/schedule/<t>, /apply/guide/<t> 처럼 한 단계 더 들어간 형태도 포함.
const TOKEN_PATH =
  /^\/(s|meal|w|r|cr|sp|v|apply)(\/(?:monthly|online|schedule|guide))?\/[^/?#]+/;

export function redactAnalyticsUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.pathname = u.pathname.replace(TOKEN_PATH, (_m, root: string, sub?: string) => `/${root}${sub ?? ""}/[token]`);
    // 쿼리(?token=… 초대·비밀번호 재설정 등)와 해시는 통째로 제거
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return raw;
  }
}

export function VercelAnalytics() {
  return (
    <Analytics
      beforeSend={(event: BeforeSendEvent) => ({ ...event, url: redactAnalyticsUrl(event.url) })}
    />
  );
}
