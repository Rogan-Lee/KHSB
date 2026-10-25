"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

// 필터/탭 상태를 sessionStorage에 유지 → 다른 페이지 갔다 뒤로 돌아와도, 새로고침해도 복원(브라우저 탭을 닫으면 초기화).
// "초기화" 버튼은 setter 로 기본값을 넣으면 된다. key는 페이지별로 고유하게 (예: "online-schedules:statusFilter").
// 서버·첫 하이드레이션은 initial, 이후 저장값 — useSyncExternalStore 라 하이드레이션 불일치가 없다.

const CHANGE_EVENT = "sticky-state-change";
// 저장소 접근이 막힌 브라우저에서도 이번 탭 동안은 유지되도록 메모리에도 둔다
const memory = new Map<string, string>();

function read(key: string): string | null {
  const cached = memory.get(key);
  if (cached !== undefined) return cached;
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function parse<T>(raw: string | null, initial: T): T {
  if (raw === null) return initial;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return initial;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

export function useStickyState<T>(
  key: string,
  initial: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null);
  const state = useMemo(() => parse(raw, initial), [raw, initial]);

  const setState = useCallback(
    (next: React.SetStateAction<T>) => {
      const value = typeof next === "function" ? (next as (prev: T) => T)(parse(read(key), initial)) : next;
      const json = JSON.stringify(value);
      memory.set(key, json);
      try {
        sessionStorage.setItem(key, json);
      } catch {}
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [key, initial],
  );

  return [state, setState];
}
