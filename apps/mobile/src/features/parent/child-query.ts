import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { requestMobileApi } from '@/lib/mobile-api';

type Entry<T> = { path: string; group: string | null; data: T | null; error: string | null };

/**
 * 자녀 단위 조회 — useMobileQuery 와 같은 모양이지만 응답이 "어느 경로(자녀) 것인지"를 기억한다.
 *  · 자녀를 바꾸면 이전 자녀의 데이터를 절대 보여주지 않는다 (isLoading → 스켈레톤).
 *  · 같은 group(보통 자녀 id) 안에서 월·주만 바뀌면 이전 데이터를 유지한 채(isStale) 새로 불러온다.
 *  · path 가 null 이면 요청하지 않는다. 화면 재포커스·앱 복귀 시 조용히 다시 불러온다.
 *  · pollMs 를 주면 화면이 보이는 동안 그 간격으로 조용히 갱신 (오늘 출결 등).
 */
export function useChildQuery<T>(
  path: string | null,
  group: string | null = null,
  options: { pollMs?: number } = {},
) {
  const { pollMs } = options;
  const [entry, setEntry] = useState<Entry<T> | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const latest = useRef<string | null>(path);

  useEffect(() => {
    latest.current = path;
  }, [path]);

  const fetchPath = useCallback(
    (p: string): Promise<void> =>
      requestMobileApi<T>(p).then(
        (data) => {
          if (latest.current === p) setEntry({ path: p, group, data, error: null });
        },
        (e: unknown) => {
          if (latest.current !== p) return;
          const message = e instanceof Error ? e.message : '데이터를 불러오지 못했어요.';
          setEntry((prev) => ({
            path: p,
            group,
            data: prev?.path === p ? prev.data : null,
            error: message,
          }));
        },
      ),
    [group],
  );

  useEffect(() => {
    if (path) void fetchPath(path);
  }, [path, fetchPath]);

  // 같은 경로로 다시 포커스될 때만 재조회 (경로가 바뀐 건 위 이펙트가 이미 불러옴)
  const focusedPath = useRef<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!path) return;
      if (focusedPath.current === path) void fetchPath(path);
      focusedPath.current = path;
      const sub = AppState.addEventListener('change', (st) => {
        if (st === 'active') void fetchPath(path);
      });
      const timer = pollMs
        ? setInterval(() => {
            if (AppState.currentState === 'active') void fetchPath(path);
          }, pollMs)
        : null;
      return () => {
        sub.remove();
        if (timer) clearInterval(timer);
      };
    }, [path, fetchPath, pollMs]),
  );

  const refresh = useCallback(async () => {
    if (!path) return;
    setIsRefreshing(true);
    await fetchPath(path);
    setIsRefreshing(false);
  }, [path, fetchPath]);

  const retry = useCallback(() => {
    if (!path) return;
    setEntry((prev) => (prev?.path === path ? null : prev));
    void fetchPath(path);
  }, [path, fetchPath]);

  const exact = entry && entry.path === path ? entry : null;
  const sameGroup = !exact && entry && group != null && entry.group === group ? entry : null;

  return {
    data: exact?.data ?? sameGroup?.data ?? null,
    error: exact?.error ?? null,
    /** 이 경로의 응답이 아직 없음 (첫 로드) */
    isLoading: !!path && !exact,
    /** 같은 자녀의 이전 조건 데이터를 보여주는 중 */
    isStale: !!sameGroup,
    isRefreshing,
    refresh,
    retry,
  };
}
