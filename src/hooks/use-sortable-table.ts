"use client";

import { useMemo, useRef, useState } from "react";

export type SortDir = "asc" | "desc";
export type SortState<K extends string> = { key: K; dir: SortDir } | null;

type Comparable = string | number | Date | boolean | null | undefined;

/**
 * 테이블 헤더 클릭으로 정렬 가능하게 해주는 훅.
 *
 * - 3-state 토글: 미정렬 → asc → desc → 미정렬 (반복)
 * - null/undefined 값은 방향과 무관하게 항상 뒤로
 * - accessors는 컬럼 키 → 비교 가능한 값 추출기
 *
 * @example
 * const { rows, sort, toggle } = useSortableTable(students, {
 *   name: (s) => s.name,
 *   seat: (s) => parseInt(s.seat ?? "9999"),  // 문자열 좌석을 숫자로
 *   createdAt: (s) => s.createdAt,
 * });
 *
 * @param rows 원본 row 배열
 * @param accessors 컬럼 키별 값 추출기 (매 렌더 새로 만들어도 OK — 내부에서 ref로 캡처)
 */
export function useSortableTable<T, K extends string>(
  rows: T[],
  accessors: Record<K, (row: T) => Comparable>,
) {
  const [sort, setSort] = useState<SortState<K>>(null);

  // accessors는 보통 인라인으로 전달되므로 ref로 캡처해서 rows/sort 변화에만 재계산
  const accessorsRef = useRef(accessors);
  accessorsRef.current = accessors;

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const getter = accessorsRef.current[sort.key];
    if (!getter) return rows;
    return [...rows].sort((a, b) => {
      const av = getter(a);
      const bv = getter(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
  }, [rows, sort]);

  const toggle = (key: K) => {
    setSort((s) => {
      if (s?.key !== key) return { key, dir: "asc" };
      if (s.dir === "asc") return { key, dir: "desc" };
      return null; // asc → desc → 미정렬 (기본 정렬 복원)
    });
  };

  return { rows: sorted, sort, toggle } as const;
}
