import { useCallback, useEffect, useRef, useState } from 'react';

import { toast } from '@/design';
import { kstToday } from '@/features/parent/today-format';
import { addDaysStr, dowOf } from '@/features/student-plan/format';
import {
  plansPath,
  saveStudentPlans,
  type DailyPlan,
  type PlanItem,
  type PlansRangeResponse,
} from '@/lib/api/student-plan';
import { useMobileQuery } from '@/lib/mobile-api';

// 공부 플래너 — 날짜별 할 일(DailyPlan.items). 서버는 날짜마다 목록 전체를 바꿔 끼운다
// (src/lib/student-schedule-core saveDailyPlansForStudent). 직원 시간표(day-view)도 같은 목록을 고친다.

/** 과목 칩 — colorCode 는 시간표와 같은 이름(format.dotColor) */
export const SUBJECTS: { name: string; color: string }[] = [
  { name: '국어', color: 'red' },
  { name: '수학', color: 'blue' },
  { name: '영어', color: 'purple' },
  { name: '한국사', color: 'orange' },
  { name: '탐구', color: 'green' },
  { name: '기타', color: 'teal' },
];

/** 목표 시간 칩(분) */
export const DURATIONS = [30, 60, 90, 120, 180];

/** 서버 규칙과 같음 — 지난 7일 ~ 4주 뒤만 고칠 수 있다 */
const EDIT_PAST_DAYS = 7;
const EDIT_FUTURE_DAYS = 28;

export { kstToday };


/** 그 날짜가 속한 주의 월요일 */
export function mondayOf(date: string) {
  const dow = dowOf(date);
  return addDaysStr(date, dow === 0 ? -6 : 1 - dow);
}

export const isEditable = (date: string, today: string) =>
  date >= addDaysStr(today, -EDIT_PAST_DAYS) && date <= addDaysStr(today, EDIT_FUTURE_DAYS);

export function fmtMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}분`;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}

/** 화면에 보이는 항목 — 직원 시간표가 만들다 만 빈 항목은 저장할 땐 남기고 화면·집계에선 뺀다 */
export const visible = (items: PlanItem[]) => items.filter((it) => it.text.trim());

export function progressOf(items: PlanItem[]) {
  const list = visible(items);
  const done = list.filter((it) => it.done).length;
  const minutes = list.reduce((n, it) => n + (it.duration ?? 0), 0);
  return { total: list.length, done, ratio: list.length ? done / list.length : 0, minutes };
}

export function newItemId() {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

const SAVE_DELAY = 600;
const SAVE_CHUNK = 7; // 서버가 한 번에 받는 최대 일수

/**
 * 한 주(월~일) 계획 + 편집. 앞뒤 하루를 같이 불러 둔다 — 월요일의 "어제 못 한 계획 가져오기",
 * 일요일의 "내일로 미루기"가 불러오지 않은 날짜 목록을 덮어쓰지 않게.
 * 편집은 화면 상태에 먼저 반영하고 0.6초 모아서 한 번에 저장(두 날짜를 같이 바꾸는 미루기도 한 요청 = 한 트랜잭션).
 */
export function usePlanner(weekStart: string) {
  const from = addDaysStr(weekStart, -1);
  const to = addDaysStr(weekStart, 7);
  const query = useMobileQuery<PlansRangeResponse>(plansPath(from, to));
  const { retry } = query;
  const [edits, setEdits] = useState<Record<string, PlanItem[]>>({});
  const [saving, setSaving] = useState(false);
  const pending = useRef(new Map<string, PlanItem[]>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    timer.current = null;
    const days = [...pending.current.entries()].map(([date, items]) => ({ date, items }));
    pending.current.clear();
    if (days.length === 0) return;
    const chunks: DailyPlan[][] = [];
    for (let i = 0; i < days.length; i += SAVE_CHUNK) chunks.push(days.slice(i, i + SAVE_CHUNK));
    Promise.all(chunks.map(saveStudentPlans))
      .catch((e: unknown) => {
        toast(e instanceof Error ? e.message : '저장하지 못했어요', 'error');
        // 저장 안 된 걸 저장된 것처럼 두지 않는다 — 그 날짜는 서버 값으로 되돌림
        setEdits((prev) => {
          const next = { ...prev };
          days.forEach((d) => delete next[d.date]);
          return next;
        });
        void retry();
      })
      .finally(() => {
        if (!timer.current && pending.current.size === 0) setSaving(false);
      });
  }, [retry]);

  const commit = useCallback(
    (days: DailyPlan[]) => {
      setEdits((prev) => {
        const next = { ...prev };
        days.forEach((d) => (next[d.date] = d.items));
        return next;
      });
      days.forEach((d) => pending.current.set(d.date, d.items));
      setSaving(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DELAY);
    },
    [flush],
  );

  // 화면을 떠날 때 모아 둔 편집을 바로 보낸다
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        flush();
      }
    },
    [flush],
  );

  // 주를 옮기는 동안엔 예전 주 응답이 남아 있다 — 범위가 맞을 때만 쓴다
  const loaded = query.data && query.data.from === from ? query.data : null;
  const itemsOf = (date: string): PlanItem[] =>
    edits[date] ?? loaded?.days.find((d) => d.date === date)?.items ?? [];

  return {
    loaded: !!loaded,
    today: query.data?.today ?? kstToday(),
    error: loaded ? null : query.error,
    isRefreshing: query.isRefreshing,
    refresh: query.refresh,
    retry,
    saving,
    itemsOf,
    commit,
  };
}

export type Planner = ReturnType<typeof usePlanner>;

// ── 편집 동작 (항목 목록 → 새 목록) ───────────────────────────────────────

/** 미완료 위 · 완료 아래, 같은 묶음 안에선 넣은 순서 */
export function ordered(items: PlanItem[]) {
  const list = visible(items);
  return [...list.filter((it) => !it.done), ...list.filter((it) => it.done)];
}

export const toggleItem = (items: PlanItem[], id: string) =>
  items.map((it) => (it.id === id ? { ...it, done: !it.done } : it));

export const removeItem = (items: PlanItem[], id: string) => items.filter((it) => it.id !== id);

export const replaceItem = (items: PlanItem[], next: PlanItem) =>
  items.map((it) => (it.id === next.id ? next : it));

/** 다른 날로 옮기기 — 옮긴 항목은 미완료로, 같은 id 가 이미 있으면(두 번 누름) 그대로 */
export function moveItem(p: Planner, from: string, to: string, id: string): DailyPlan[] | null {
  const item = p.itemsOf(from).find((it) => it.id === id);
  if (!item) return null;
  const target = p.itemsOf(to);
  return [
    { date: from, items: removeItem(p.itemsOf(from), id) },
    { date: to, items: target.some((it) => it.id === id) ? target : [...target, { ...item, done: false }] },
  ];
}

/** 어제 못 한 계획 중 오늘 목록에 아직 없는 것(같은 글 기준) */
export function leftovers(p: Planner, yesterday: string, today: string) {
  const have = new Set(visible(p.itemsOf(today)).map((it) => it.text.trim()));
  return visible(p.itemsOf(yesterday)).filter((it) => !it.done && !have.has(it.text.trim()));
}

/**
 * 어제 못 한 계획을 오늘 끝에 복사 — 어제 기록은 그대로 둔다
 * (학부모·직원이 보는 어제 달성률이 옮기기로 바뀌지 않게).
 */
export function carryOver(p: Planner, yesterday: string, today: string): DailyPlan[] | null {
  const left = leftovers(p, yesterday, today);
  if (left.length === 0) return null;
  return [{ date: today, items: [...p.itemsOf(today), ...left.map((it) => ({ ...it, id: newItemId(), done: false }))] }];
}
