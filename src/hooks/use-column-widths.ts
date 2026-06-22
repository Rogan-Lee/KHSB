"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * 표 열 너비를 localStorage 에 저장/복원하는 훅.
 * - key 별로 열 너비(px) 맵을 보관. 드래그 중에는 setWidth 로 갱신.
 * - 미저장 시 defaults 사용. reset() 으로 기본값 복원.
 *
 * 주의: 서버/클라이언트 hydration 불일치 방지를 위해 초기 렌더는 defaults 로 시작하고,
 * 마운트 후 effect 에서 저장값을 병합한다.
 */
export function useColumnWidths(
  storageKey: string,
  defaults: Record<string, number>,
  minWidth = 48,
) {
  const [widths, setWidths] = useState<Record<string, number>>(defaults);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, number>;
        setWidths((w) => ({ ...w, ...parsed }));
      }
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const setWidth = useCallback(
    (col: string, px: number) => {
      setWidths((prev) => {
        const next = { ...prev, [col]: Math.max(minWidth, Math.round(px)) };
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [storageKey, minWidth],
  );

  const reset = useCallback(() => {
    setWidths(defaults);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }, [storageKey, defaults]);

  return { widths, setWidth, reset };
}
