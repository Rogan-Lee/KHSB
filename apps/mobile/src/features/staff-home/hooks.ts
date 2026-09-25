import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { isStaffCapabilities, type StaffCapabilities } from '@/lib/capabilities';
import { requestMobileApi } from '@/lib/mobile-api';
import { useSession } from '@/lib/session';

/** 직원 capabilities — 역할별 노출은 항상 이것으로 판단 (역할 배열 하드코딩 금지) */
export function useStaffCaps(): StaffCapabilities | null {
  const { session } = useSession();
  return session && isStaffCapabilities(session.capabilities) ? session.capabilities : null;
}

/**
 * 당겨서 새로고침 전용 스피너 상태.
 * useMobileQuery 의 refresh() 를 저장 직후 조용히 부를 때는 스피너가 뜨지 않게 분리한다.
 */
export function usePullRefresh(refresh: () => Promise<void>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void refresh().finally(() => setRefreshing(false));
  }, [refresh]);
  return { refreshing, onRefresh };
}

/**
 * 낙관적 토글 값 — 서버 응답(source)이 바뀌면 자동으로 비워진다.
 *   const [over, setOver] = useOptimistic<boolean>(data);
 *   const received = over[item.id] ?? item.received;
 */
export function useOptimistic<T>(source: unknown) {
  const [state, setState] = useState<{ source: unknown; map: Record<string, T> }>({
    source,
    map: {},
  });
  const map = state.source === source ? state.map : {};
  const set = useCallback(
    (id: string, value: T | undefined) =>
      setState((prev) => {
        const next = { ...(prev.source === source ? prev.map : {}) };
        if (value === undefined) delete next[id];
        else next[id] = value;
        return { source, map: next };
      }),
    [source]
  );
  return [map, set] as const;
}

/**
 * 조건부 조회 — path 가 null 이면 부르지 않는다(권한 없는 역할). 화면 포커스마다 조용히 갱신.
 * 실패는 무시(보조 정보용).
 */
export function useOptionalQuery<T>(path: string | null) {
  const [state, setState] = useState<{ path: string | null; data: T | null }>({
    path: null,
    data: null,
  });
  useFocusEffect(
    useCallback(() => {
      if (!path) return;
      let active = true;
      requestMobileApi<T>(path)
        .then((data) => {
          if (active) setState({ path, data });
        })
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }, [path])
  );
  return state.path === path ? state.data : null;
}

export function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
