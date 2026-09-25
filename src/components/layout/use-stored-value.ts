"use client";

import { useCallback, useSyncExternalStore } from "react";

// localStorage 값을 SSR-안전하게 읽고 쓰는 훅.
// 서버·첫 하이드레이션은 fallback, 이후 클라이언트 값 — effect 안 setState 없이 동기화된다.
// 같은 키를 쓰는 다른 컴포넌트(데스크톱·모바일 사이드바 등)도 함께 갱신된다.

const CHANGE_EVENT = "stored-value-change";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function useStoredValue(key: string, fallback: string): [string, (next: string) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key) ?? fallback;
      } catch {
        return fallback;
      }
    },
    () => fallback,
  );
  const set = useCallback(
    (next: string) => {
      try {
        localStorage.setItem(key, next);
      } catch {
        // 저장소 접근 불가 — 이번 세션 동안은 기본값 유지
      }
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [key],
  );
  return [value, set];
}
