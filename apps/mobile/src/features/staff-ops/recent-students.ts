import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// 최근 본 학생 — 기기에만 저장 (웹: localStorage, 네이티브: SecureStore). 최대 8명.

export type RecentStudent = { id: string; name: string; grade: string; seat: string | null };

const KEY = 'staff_recent_students_v1';
const MAX = 8;

let cache: RecentStudent[] | null = null;
const listeners = new Set<(list: RecentStudent[]) => void>();

async function read(): Promise<RecentStudent[]> {
  if (cache) return cache;
  try {
    const raw =
      Platform.OS === 'web'
        ? (globalThis.localStorage?.getItem(KEY) ?? null)
        : await SecureStore.getItemAsync(KEY);
    const parsed = raw ? (JSON.parse(raw) as RecentStudent[]) : [];
    cache = Array.isArray(parsed) ? parsed.slice(0, MAX) : [];
  } catch {
    cache = [];
  }
  return cache;
}

async function write(list: RecentStudent[]) {
  cache = list;
  listeners.forEach((fn) => fn(list));
  try {
    const raw = JSON.stringify(list);
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, raw);
    else await SecureStore.setItemAsync(KEY, raw);
  } catch {
    // 저장 실패는 무시 (편의 기능)
  }
}

export async function rememberStudent(s: RecentStudent) {
  const list = await read();
  await write([s, ...list.filter((x) => x.id !== s.id)].slice(0, MAX));
}

export async function clearRecentStudents() {
  await write([]);
}

export function useRecentStudents() {
  const [list, setList] = useState<RecentStudent[]>(cache ?? []);
  useEffect(() => {
    let active = true;
    void read().then((l) => active && setList(l));
    listeners.add(setList);
    return () => {
      active = false;
      listeners.delete(setList);
    };
  }, []);
  return list;
}
