"use client";

import { useEffect, useRef } from "react";
import { incrementReportView } from "@/actions/online/parent-reports";

const COOKIE_TTL_HOURS = 24;

/**
 * 학부모 공개 페이지 마운트 시 한 번만 viewCount 를 증가시키는 beacon.
 * Server Component 는 cookie 쓰기 불가 → 클라이언트에서 처리.
 *
 * 일일 쿨다운: `document.cookie` 로 24시간 내 재방문이면 isUnique=false 전송.
 * (uniqueViewCount 는 증가하지 않음, 일반 viewCount 만 +1)
 */
export function ReportViewBeacon({ token }: { token: string }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    const cookieName = `online-viewed-${token.slice(0, 12)}`;
    const isUnique = !readCookie(cookieName);
    if (isUnique) {
      writeCookie(cookieName, "1", COOKIE_TTL_HOURS);
    }

    // fire-and-forget — 실패해도 사용자 경험 영향 없음
    incrementReportView({ token, isUnique }).catch(() => {});
  }, [token]);

  return null;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

function writeCookie(name: string, value: string, hours: number) {
  if (typeof document === "undefined") return;
  const maxAge = hours * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; samesite=lax`;
}
