// 원본 src/lib/onboarding/entry.ts — 고치면 둘 다 (앱은 src/ 를 import 할 수 없어 필요한 것만 복사)
//
// 입실 준비 — 새로 입실한 학생이 앱에서 내는 것(등원·학원 일정·성적·멘토 매칭 설문).
// GET /api/mobile/v1/student/onboarding            → EntryOnboardingResponse
// PUT /api/mobile/v1/student/onboarding/grades     body EntryGrades              → EntryOnboardingResponse
// PUT /api/mobile/v1/student/onboarding/mentor     body { answers: EntryMentor } → EntryOnboardingResponse

import * as SecureStore from 'expo-secure-store';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { toast } from '@/design';
import { mutateMobileApi, requestMobileApi } from '@/lib/mobile-api';
import { useSession } from '@/lib/session';

// ─── 원본 복사 ───────────────────────────────────────────────────────

export const ENTRY_STEPS = ['schedule', 'grades', 'mentor'] as const;
export type EntryStepKey = (typeof ENTRY_STEPS)[number];
export const ENTRY_STEP_LABEL: Record<EntryStepKey, string> = {
  schedule: '등원·학원 일정',
  grades: '성적',
  mentor: '멘토 매칭 설문',
};

export const GRADE_SUBJECTS = ['국어', '수학', '영어', '사회', '과학'] as const;
export type GradeSubject = (typeof GRADE_SUBJECTS)[number];
/** 등급 1~9. null = 안 봤거나 모름 */
export type SubjectGrades = Partial<Record<GradeSubject, number | null>>;
export type EntryGrades = {
  mock: { examName: string; scores: SubjectGrades } | null;
  school: { term: string; scores: SubjectGrades } | null;
};

export type MentorQuestion = {
  key: string;
  title: string;
  kind: 'single' | 'multi' | 'text';
  options?: string[];
  /** 선택지 아래 작은 설명 (선택지 문구 → 설명) */
  hints?: Record<string, string>;
  required: boolean;
  placeholder?: string;
};
export type EntryMentor = Record<string, string | string[]>;

export type Saved<T> = T & { savedAt: string };

export type EntryOnboardingResponse = {
  show: boolean;
  steps: { key: EntryStepKey; label: string; done: boolean }[];
  schedule: { submittedAt: string; status: string } | null;
  grades: Saved<EntryGrades> | null;
  mentor: { questions: MentorQuestion[]; answers: Saved<{ answers: EntryMentor }> | null };
};

// ─── 경로 ────────────────────────────────────────────────────────────

const ENTRY_PATH = '/api/mobile/v1/student/onboarding';
export const ENTRY_HREF = '/(student)/onboarding' as Href;
const STEP_HREF: Record<EntryStepKey, Href> = {
  schedule: '/(student)/schedule?tab=submit' as Href,
  grades: '/(student)/onboarding/grades' as Href,
  mentor: '/(student)/onboarding/mentor' as Href,
};
export const entryStepHref = (key: EntryStepKey) => STEP_HREF[key];

// ─── 캐시 (학생별) — 저장 응답으로 목록·홈 카드가 바로 바뀐다 ───────────

type CacheEntry = { owner: string; data: EntryOnboardingResponse };
let cache: CacheEntry | null = null;
const listeners = new Set<(entry: CacheEntry) => void>();
/** 저장할 때마다 +1 — 저장보다 먼저 출발한 조회 결과가 새 값을 덮지 않게 */
let saveSeq = 0;

function publish(entry: CacheEntry) {
  cache = entry;
  listeners.forEach((fn) => fn(entry));
}

const errorMessage = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);
const LOAD_ERROR = '데이터를 불러오지 못했어요.';

async function fetchEntry(owner: string) {
  const seq = saveSeq;
  const next = await requestMobileApi<EntryOnboardingResponse>(ENTRY_PATH);
  if (seq === saveSeq) publish({ owner, data: next });
}

/** 조회 — 캐시가 있으면 바로 그리고 조용히 다시 불러온다. 화면 재포커스 때도 다시 불러온다 */
export function useEntryOnboarding() {
  const { session } = useSession();
  const owner = session?.domainId ?? '';
  const cached = cache && cache.owner === owner ? cache.data : null;
  const [data, setData] = useState<EntryOnboardingResponse | null>(cached);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!cached);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const fn = (entry: CacheEntry) => {
      if (entry.owner === owner) setData(entry.data);
    };
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, [owner]);

  const load = useCallback(
    async (mode: 'quiet' | 'refresh' | 'retry') => {
      if (!owner) return;
      if (mode === 'refresh') setIsRefreshing(true);
      if (mode === 'retry') {
        setError(null);
        setIsLoading(true);
      }
      try {
        await fetchEntry(owner);
        setError(null);
      } catch (e) {
        // 조용한 재조회 실패는 이미 그린 값을 그대로 둔다
        if (mode !== 'quiet') setError(errorMessage(e, LOAD_ERROR));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [owner],
  );

  // 첫 조회 — 캐시가 없을 때만 실패를 보여 준다
  useEffect(() => {
    if (!owner) return;
    let active = true;
    fetchEntry(owner)
      .then(() => active && setError(null))
      .catch((e) => active && cache?.owner !== owner && setError(errorMessage(e, LOAD_ERROR)))
      .finally(() => active && setIsLoading(false));
    return () => {
      active = false;
    };
  }, [owner]);

  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focused.current) {
        focused.current = true;
        return;
      }
      void load('quiet');
    }, [load]),
  );

  const refresh = useCallback(() => load('refresh'), [load]);
  const retry = useCallback(() => load('retry'), [load]);
  return { data, error, isLoading, isRefreshing, refresh, retry };
}

/**
 * 한 단계 저장 — 처리 중 다시 누르면 무시, 성공하면 캐시 갱신 → 토스트 → 뒤로.
 * 실패 문구(서버 400 포함)는 error 로 돌려줘 화면에 보여 준다.
 */
export function useEntrySave(step: 'grades' | 'mentor') {
  const { session } = useSession();
  const owner = session?.domainId ?? '';
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const save = useCallback(
    async (body: unknown) => {
      if (busy.current) return;
      busy.current = true;
      setSaving(true);
      setError(null);
      saveSeq += 1;
      try {
        const next = await mutateMobileApi<EntryOnboardingResponse>(`${ENTRY_PATH}/${step}`, 'PUT', body);
        publish({ owner, data: next });
        toast('저장했어요', 'success');
        if (router.canGoBack()) router.back();
        else router.replace(ENTRY_HREF);
      } catch (e) {
        setError(errorMessage(e, '저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.'));
      } finally {
        busy.current = false;
        setSaving(false);
      }
    },
    [owner, step],
  );

  return { save, saving, error, setError };
}

// ─── 첫 로그인 자동 열기 ─────────────────────────────────────────────
// 기기에 한 번 띄웠다고 적어 둔다 (features/safety/terms-gate.tsx 와 같은 방식: 웹 localStorage, 네이티브 SecureStore).

async function readFlag(key: string) {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

async function writeFlag(key: string) {
  if (Platform.OS === 'web') globalThis.localStorage?.setItem(key, '1');
  else await SecureStore.setItemAsync(key, '1');
}

/** 학생 홈에서 부른다 — 안내 대상이고 이 기기에서 아직 안 띄웠으면 입실 준비를 한 번 연다 */
export function useEntryAutoOpen(data: EntryOnboardingResponse | null) {
  const { session } = useSession();
  const owner = session?.domainId;
  const show = !!data?.show;

  useEffect(() => {
    if (!show || !owner) return;
    const key = `studyroom.entry.v1.prompted.${owner}`;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      try {
        if (await readFlag(key)) return;
        // 먼저 적고 연다 — 못 적으면 매번 뜨지 않게 열지 않는다
        await writeFlag(key);
      } catch {
        return; // 저장소를 못 쓰면 자동 열기 없이 홈 카드만
      }
      // 홈이 먼저 그려진 뒤에 연다 (약관 동의 시트는 Modal 이라 그 아래로 쌓여도 충돌하지 않는다)
      if (active) timer = setTimeout(() => router.push(ENTRY_HREF), 500);
    })();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [show, owner]);
}
