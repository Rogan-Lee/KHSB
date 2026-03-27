import { useState, useRef, useCallback } from "react";

/**
 * 폼 초안을 sessionStorage에 자동 저장하는 훅.
 * - 페이지를 벗어나도 초안이 유지됨
 * - clearDraft() 호출 시 (저장 버튼 클릭 후) 초기화
 */
export function useDraft<T>(
  key: string,
  initial: T
): [T, (v: T | ((prev: T) => T)) => void, () => void] {
  const initialRef = useRef(initial);

  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = sessionStorage.getItem(`draft:${key}`);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  const set = useCallback(
    (newVal: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const next =
          typeof newVal === "function"
            ? (newVal as (p: T) => T)(prev)
            : newVal;
        try {
          sessionStorage.setItem(`draft:${key}`, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [key]
  );

  const clear = useCallback(() => {
    try {
      sessionStorage.removeItem(`draft:${key}`);
    } catch {}
    setValue(initialRef.current);
  }, [key]);

  return [value, set, clear];
}
