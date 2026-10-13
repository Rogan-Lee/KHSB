import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { addDismissed, parseDismissed } from './banner-state';

/**
 * 홈 수강료 배너를 닫은 기록 — lib/parent-child.tsx 와 같은 방식의 모듈 단위 스토어.
 * SecureStore(웹은 localStorage)에 키 목록을 JSON 으로 두고, 처음 읽을 때 한 번 동기로 불러온다.
 * 키에 청구서 id 가 들어 있어서 한 기기를 여러 계정이 써도 서로 섞이지 않는다.
 */
const STORAGE_KEY = 'studyroom.parent.tuitionBannerDismissed.v1';

const EMPTY: readonly string[] = [];

function readStored(): string | null {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
    return SecureStore.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(value: string) {
  try {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(STORAGE_KEY, value);
      return;
    }
    void SecureStore.setItemAsync(STORAGE_KEY, value).catch(() => undefined);
  } catch {
    // 저장에 실패해도 이번 실행 동안은 메모리 값으로 닫힌 채 둔다
  }
}

// undefined = 아직 저장소를 읽지 않음
let dismissed: readonly string[] | undefined;
const listeners = new Set<() => void>();

function getSnapshot(): readonly string[] {
  if (dismissed === undefined) dismissed = parseDismissed(readStored());
  return dismissed;
}

function getServerSnapshot(): readonly string[] {
  return EMPTY;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 배너 닫기 — key 는 bannerKey() 값 */
export function dismissTuitionBanner(key: string) {
  const next = addDismissed(getSnapshot(), key);
  dismissed = next;
  writeStored(JSON.stringify(next));
  listeners.forEach((fn) => fn());
}

/** 닫은 배너 키 목록 */
export function useDismissedTuitionBanners(): readonly string[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
