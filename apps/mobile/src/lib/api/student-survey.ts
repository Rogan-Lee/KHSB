import { useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { toast } from '@/design';
import {
  mutateMobileApi,
  requestMobileApi,
  type SurveyResponse,
  type SurveySaveResponse,
  type SurveySectionPayload,
} from '@/lib/mobile-api';
import { useSession } from '@/lib/session';

/**
 * 학생 초기 설문 — 클라이언트 API.
 * 서버: GET  /api/mobile/v1/student/survey          → SurveyResponse
 *       POST /api/mobile/v1/student/survey/section  { sectionKey, value } → SurveySaveResponse
 *       POST /api/mobile/v1/student/survey/submit   → { ok, alreadySubmitted? }
 *
 * 목록 화면과 질문 화면이 같은 데이터를 쓰도록 모듈 캐시(학생별)를 두고,
 * 자동저장 응답(sectionComplete·surveyComplete)으로 캐시를 즉시 고쳐 목록이 바로 반영되게 한다.
 * 같은 섹션의 저장은 순서대로 보내고(늦게 도착한 옛 값이 덮어쓰지 않게), 조회 전에 대기 중인 저장을 기다린다.
 */

export type { SurveyResponse, SurveySaveResponse, SurveySectionPayload };
export type SurveySubmitResponse = { ok: boolean; alreadySubmitted?: boolean };
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export const SURVEY_PATH = '/api/mobile/v1/student/survey';

/** 앱 화면 경로 — 목록 · 질문(섹션 key) */
export const SURVEY_OVERVIEW_HREF = '/(student)/survey' as Href;
export const surveyStepHref = (key: string) => `/(student)/survey/${key}` as Href;
const AUTOSAVE_DELAY_MS = 800;

// ─── 캐시 ────────────────────────────────────────────────────────────

type CacheEntry = { owner: string; data: SurveyResponse };
let cache: CacheEntry | null = null;
const listeners = new Set<(entry: CacheEntry) => void>();

function publish(entry: CacheEntry) {
  cache = entry;
  listeners.forEach((fn) => fn(entry));
}

function patchCache(fn: (data: SurveyResponse) => SurveyResponse) {
  if (cache) publish({ owner: cache.owner, data: fn(cache.data) });
}

/** 지금 캐시에 있는 최신 설문 (자동저장 응답까지 반영) — 제출 직전 완료 여부 확인용 */
export function peekSurvey(): SurveyResponse | null {
  return cache?.data ?? null;
}

// ─── 저장 (섹션별 직렬화 + 대기 추적) ────────────────────────────────

const pending = new Set<Promise<unknown>>();
const chains = new Map<string, Promise<unknown>>();
/** 저장을 시작할 때마다 +1 — 조회 도중 저장이 끼어들었는지 확인용 */
let saveSeq = 0;

export function saveSurveySection(sectionKey: string, value: unknown): Promise<SurveySaveResponse> {
  saveSeq += 1;
  const prev = chains.get(sectionKey) ?? Promise.resolve();
  const run = prev
    .catch(() => undefined)
    .then(() =>
      mutateMobileApi<SurveySaveResponse>(`${SURVEY_PATH}/section`, 'POST', { sectionKey, value }),
    )
    .then((res) => {
      patchCache((d) => ({
        ...d,
        complete: res.surveyComplete,
        sections: d.sections.map((s) =>
          s.key === sectionKey ? { ...s, value, complete: res.sectionComplete } : s,
        ),
      }));
      return res;
    });
  chains.set(sectionKey, run);
  pending.add(run);
  const done = () => {
    pending.delete(run);
    if (chains.get(sectionKey) === run) chains.delete(sectionKey);
  };
  run.then(done, done);
  return run;
}

/** 진행 중인 자동저장이 모두 끝날 때까지 (실패 포함) */
export async function waitForSurveySaves() {
  await Promise.allSettled([...pending]);
}

export async function submitStudentSurvey(): Promise<SurveySubmitResponse> {
  await waitForSurveySaves();
  const res = await mutateMobileApi<SurveySubmitResponse>(`${SURVEY_PATH}/submit`, 'POST', {});
  patchCache((d) => ({ ...d, submittedAt: d.submittedAt ?? new Date().toISOString() }));
  return res;
}

// ─── 조회 훅 ─────────────────────────────────────────────────────────

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : '설문을 불러오지 못했어요.');

/** 저장 대기 → 조회 → 캐시 갱신. 조회 도중 저장이 시작됐으면 옛 값이므로 한 번 더 불러온다 */
async function loadSurvey(owner: string) {
  for (let attempt = 0; ; attempt++) {
    await waitForSurveySaves();
    const seq = saveSeq;
    const next = await requestMobileApi<SurveyResponse>(SURVEY_PATH);
    if (seq !== saveSeq && attempt < 2) continue;
    publish({ owner, data: next });
    return next;
  }
}

/**
 * 설문 조회 — 캐시가 있으면 바로 보여주고 조용히 다시 불러온다.
 * 화면 재포커스 시 재조회(저장 대기 후), refresh = 당겨서 새로고침.
 */
export function useStudentSurvey() {
  const { session } = useSession();
  const owner = session?.domainId ?? '';
  const ownerRef = useRef(owner);
  useEffect(() => {
    ownerRef.current = owner;
  }, [owner]);

  const [initial] = useState(() => (cache && cache.owner === owner ? cache.data : null));
  const [data, setData] = useState<SurveyResponse | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!initial);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const fn = (entry: CacheEntry) => {
      if (entry.owner === ownerRef.current) setData(entry.data);
    };
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

    const fetchLatest = useCallback(async (reportError: boolean) => {
    try {
      await loadSurvey(ownerRef.current);
      setError(null);
    } catch (e) {
      if (reportError) setError(errorMessage(e));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // 첫 조회 — 캐시가 있으면 조용히, 없으면 실패를 보여 준다
  useEffect(() => {
    let active = true;
    loadSurvey(ownerRef.current)
      .then(() => active && setError(null))
      .catch((e) => active && !initial && setError(errorMessage(e)))
      .finally(() => active && setIsLoading(false));
    return () => {
      active = false;
    };
  }, [initial]);

  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focused.current) {
        focused.current = true;
        return;
      }
      void fetchLatest(false);
    }, [fetchLatest]),
  );

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchLatest(true);
  }, [fetchLatest]);
  const retry = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    await fetchLatest(true);
  }, [fetchLatest]);

  return { data, error, isLoading, isRefreshing, refresh, retry };
}

// ─── 자동저장 초안 훅 ────────────────────────────────────────────────

/**
 * 한 섹션의 편집 상태 + 자동저장(입력 멈추고 0.8초 뒤) — 웹 SurveyWizardStep 과 같은 규칙.
 *  · update(fn): 값 변경 (잠김이면 무시)
 *  · flush(): 이동 전 즉시 저장, 성공 여부 반환
 *  · syncFromServer(v): 아직 손대지 않았으면 서버 값으로 교체 (캐시로 먼저 그린 뒤 새 값 도착 시)
 *  · 화면을 떠나거나 앱이 백그라운드로 가면 남은 변경을 저장한다.
 */
export function useSurveyDraft<T>(sectionKey: string, initial: T, locked: boolean) {
  const [value, setValue] = useState<T>(initial);
  const [status, setStatus] = useState<SaveState>('idle');
  const valueRef = useRef(value);
  const lastSaved = useRef(JSON.stringify(initial));
  const dirty = useRef(false);
  const lockedRef = useRef(locked);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  const save = useCallback(
    async (next: T): Promise<boolean> => {
      const serialized = JSON.stringify(next);
      if (serialized === lastSaved.current) return true;
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (mounted.current) setStatus('saving');
      try {
        await saveSurveySection(sectionKey, next);
        lastSaved.current = serialized;
        if (mounted.current) {
          setStatus('saved');
          idleTimer.current = setTimeout(() => mounted.current && setStatus('idle'), 1500);
        }
        return true;
      } catch {
        if (mounted.current) setStatus('error');
        return false;
      }
    },
    [sectionKey],
  );

  const update = useCallback((fn: (prev: T) => T) => {
    if (lockedRef.current) return;
    dirty.current = true;
    setValue(fn);
  }, []);

  // 입력이 멈추면 저장
  useEffect(() => {
    if (locked || JSON.stringify(value) === lastSaved.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      void save(value);
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [value, locked, save]);

  const flush = useCallback(async () => {
    if (lockedRef.current) return true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    return save(valueRef.current);
  }, [save]);

  const syncFromServer = useCallback((server: T) => {
    if (dirty.current) return;
    const serialized = JSON.stringify(server);
    if (serialized === lastSaved.current) return;
    lastSaved.current = serialized;
    setValue(server);
  }, []);

  // 앱이 백그라운드로 가면 즉시 저장
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') void flushRef.current();
    });
    return () => sub.remove();
  }, []);

  // 화면을 떠날 때 남은 변경 저장 (뒤로 가기 제스처 등)
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (!lockedRef.current && JSON.stringify(valueRef.current) !== lastSaved.current) {
        void saveSurveySection(sectionKey, valueRef.current).catch(() =>
          toast('마지막으로 고친 내용을 저장하지 못했어요. 다시 열어 확인해 주세요.', 'error'),
        );
      }
    };
  }, [sectionKey]);

  return { value, update, status, flush, syncFromServer };
}
