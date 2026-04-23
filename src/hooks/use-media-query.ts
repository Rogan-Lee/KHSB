"use client";

import { useEffect, useState } from "react";

/**
 * Tailwind 호환 브레이크포인트 헬퍼.
 * CSS 미디어 쿼리 문자열을 받아서 매칭 여부를 반환한다.
 *
 * @example
 * const isMobile = useMediaQuery("(max-width: 767px)");
 * const isTablet = useMediaQuery("(min-width: 768px) and (max-width: 1023px)");
 *
 * 초기 렌더(SSR)에서는 defaultValue(기본 false) 반환. 클라이언트 hydration 후 정확한 값.
 */
export function useMediaQuery(query: string, defaultValue = false): boolean {
  const [matches, setMatches] = useState(defaultValue);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(query);
    const handler = () => setMatches(mql.matches);
    handler();
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

/** 모바일 (< 768px) */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}
