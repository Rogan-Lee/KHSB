import { useIsFocused } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * 화면이 보이는 동안 주기적으로 + 앱이 다시 켜질 때 조용히 다시 불러온다.
 * (useMobileQuery 의 retry 처럼 당겨서-새로고침 스피너가 돌지 않는 함수를 넘길 것)
 */
export function useLiveRefresh(reload: () => unknown, intervalMs: number) {
  const isFocused = useIsFocused();
  const ref = useRef(reload);
  useEffect(() => {
    ref.current = reload;
  });

  useEffect(() => {
    if (!isFocused) return;
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void ref.current();
    }, intervalMs);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void ref.current();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [isFocused, intervalMs]);
}
