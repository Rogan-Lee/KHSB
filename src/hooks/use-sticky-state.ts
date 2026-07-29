"use client";

import { useEffect, useState } from "react";

// 필터/탭 상태를 sessionStorage에 유지 → 다른 페이지 갔다 뒤로 돌아와도 복원.
// key는 페이지별로 고유하게 (예: "online-schedules:statusFilter").
export function useStickyState<T>(
  key: string,
  initial: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = sessionStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state]);

  return [state, setState];
}
