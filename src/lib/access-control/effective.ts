// 지금 적용돼야 할 정책 계산 — 순수 함수 (DB·시계 접근 없음, 시각은 인자로 받는다).
//
// 우선순위 (같은 대상에 차단·허용이 겹칠 때 위가 이긴다):
//   1. 학생 대상 일시 조치   2. 전체 대상 일시 조치   3. 학생 대상 규칙   4. 전체 대상 규칙
//  · 같은 단계의 일시 조치끼리는 나중에 만든 것이 이긴다.
//  · 같은 단계의 규칙끼리는 요일·시간대를 정한 규칙이 "항상" 규칙을 이긴다
//    (예: 유튜브 항상 차단 + 점심시간 허용 → 점심시간엔 허용). 그래도 같으면 나중에 만든 것.
//  · "인터넷 전체"와 개별 서비스·사이트는 서로 다른 대상이다. 인터넷 전체 허용(와이파이 해제)은
//    전체 잠금만 풀고, 유튜브 차단 같은 개별 차단은 그대로 남는다.

import type {
  AccessAction,
  AccessTargetKind,
  EffectiveState,
  OverrideInput,
  PauseSetting,
  PolicySet,
  RuleInput,
} from "./types";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** KST 요일(0=일)과 자정 기준 분 */
export function kstDayMinute(now: Date): { dow: number; minute: number } {
  const k = new Date(now.getTime() + KST_OFFSET_MS);
  return { dow: k.getUTCDay(), minute: k.getUTCHours() * 60 + k.getUTCMinutes() };
}

type Schedule = Pick<RuleInput, "daysOfWeek" | "startMinute" | "endMinute">;

/** 요일·시간대를 정한 규칙인가 */
export function isScheduled(rule: Schedule): boolean {
  return rule.daysOfWeek.length > 0 || hasWindow(rule);
}

function hasWindow(rule: Schedule): rule is Schedule & { startMinute: number; endMinute: number } {
  return rule.startMinute != null && rule.endMinute != null && rule.startMinute !== rule.endMinute;
}

/**
 * 규칙의 요일·시간대가 지금에 해당하는가.
 * 시작이 종료보다 늦으면 자정을 넘는 시간대다 — 요일은 시작한 날 기준으로 본다
 * (금 22:00~02:00 은 토요일 01:00 에도 적용).
 */
export function scheduleMatches(rule: Schedule, now: Date): boolean {
  const { dow, minute } = kstDayMinute(now);
  const onDay = (d: number) => rule.daysOfWeek.length === 0 || rule.daysOfWeek.includes(d);
  if (!hasWindow(rule)) return onDay(dow);
  const { startMinute: s, endMinute: e } = rule;
  if (s < e) return onDay(dow) && minute >= s && minute < e;
  if (minute >= s) return onDay(dow);
  if (minute < e) return onDay((dow + 6) % 7);
  return false;
}

export function isPaused(pause: PauseSetting, now: Date): boolean {
  if (!pause.paused) return false;
  if (!pause.until) return true;
  const until = new Date(pause.until);
  return Number.isNaN(until.getTime()) || until > now;
}

export function isOverrideActive(o: Pick<OverrideInput, "startAt" | "endAt" | "cancelledAt">, now: Date): boolean {
  return !o.cancelledAt && o.startAt <= now && now < o.endAt;
}

type Candidate = {
  /** 규칙·일시 조치 id */
  id: string;
  key: string;
  kind: AccessTargetKind;
  target: string;
  action: AccessAction;
  /** 4 학생 일시 조치 · 3 전체 일시 조치 · 2 학생 규칙 · 1 전체 규칙 */
  rank: number;
  scheduled: number;
  createdAt: number;
  studentId: string | null;
};

const keyOf = (kind: AccessTargetKind, target: string) => (kind === "ALL" ? "ALL" : `${kind}:${target}`);

function better(a: Candidate, b: Candidate): boolean {
  if (a.rank !== b.rank) return a.rank > b.rank;
  if (a.scheduled !== b.scheduled) return a.scheduled > b.scheduled;
  if (a.createdAt !== b.createdAt) return a.createdAt > b.createdAt;
  // 완전히 같으면 차단 쪽으로 (안전한 쪽)
  return a.action === "BLOCK" && b.action !== "BLOCK";
}

function pickWinners(candidates: Candidate[]): Candidate[] {
  const winners = new Map<string, Candidate>();
  for (const c of candidates) {
    const cur = winners.get(c.key);
    if (!cur || better(c, cur)) winners.set(c.key, c);
  }
  return [...winners.values()];
}

function resolve(candidates: Candidate[]): PolicySet {
  const set: PolicySet = {
    blockAll: false,
    blockedServices: [],
    allowedServices: [],
    blockedDomains: [],
    allowedDomains: [],
  };
  for (const w of pickWinners(candidates)) {
    if (w.kind === "ALL") set.blockAll = w.action === "BLOCK";
    else if (w.kind === "SERVICE") (w.action === "BLOCK" ? set.blockedServices : set.allowedServices).push(w.target);
    else (w.action === "BLOCK" ? set.blockedDomains : set.allowedDomains).push(w.target);
  }
  set.blockedServices.sort();
  set.allowedServices.sort();
  set.blockedDomains.sort();
  set.allowedDomains.sort();
  return set;
}

export function samePolicy(a: PolicySet, b: PolicySet): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

type EffectiveInput = {
  rules: RuleInput[];
  overrides: OverrideInput[];
  pause: PauseSetting;
  now: Date;
};

/** 지금 시각에 해당하는 규칙·일시 조치를 우선순위 비교용 후보로 모은다 */
function collectCandidates({ rules, overrides, now }: EffectiveInput): Candidate[] {
  const candidates: Candidate[] = [];
  for (const r of rules) {
    if (!r.enabled || !scheduleMatches(r, now)) continue;
    if (r.scope === "STUDENT" && !r.studentId) continue;
    candidates.push({
      id: r.id,
      key: keyOf(r.targetKind, r.target),
      kind: r.targetKind,
      target: r.target,
      action: r.action,
      rank: r.scope === "STUDENT" ? 2 : 1,
      scheduled: isScheduled(r) ? 1 : 0,
      createdAt: r.createdAt.getTime(),
      studentId: r.scope === "STUDENT" ? r.studentId : null,
    });
  }
  for (const o of overrides) {
    if (!isOverrideActive(o, now)) continue;
    if (o.scope === "STUDENT" && !o.studentId) continue;
    candidates.push({
      id: o.id,
      key: keyOf(o.targetKind, o.target),
      kind: o.targetKind,
      target: o.target,
      action: o.action,
      rank: o.scope === "STUDENT" ? 4 : 3,
      scheduled: 0,
      createdAt: o.createdAt.getTime(),
      studentId: o.scope === "STUDENT" ? o.studentId : null,
    });
  }
  return candidates;
}

/** 지금 시각의 정책 — 전체 정책과, 전체와 달라지는 학생별 정책 */
export function computeEffective(input: EffectiveInput): EffectiveState {
  if (isPaused(input.pause, input.now)) {
    return {
      paused: true,
      global: { blockAll: false, blockedServices: [], allowedServices: [], blockedDomains: [], allowedDomains: [] },
      students: {},
    };
  }

  const candidates = collectCandidates(input);
  const globalCandidates = candidates.filter((c) => c.studentId === null);
  const global = resolve(globalCandidates);

  const students: Record<string, PolicySet> = {};
  const studentIds = new Set(candidates.map((c) => c.studentId).filter((id): id is string => id !== null));
  for (const id of studentIds) {
    const policy = resolve([...globalCandidates, ...candidates.filter((c) => c.studentId === id)]);
    if (!samePolicy(policy, global)) students[id] = policy;
  }
  return { paused: false, global, students };
}

/**
 * 지금 실제로 효력이 있는 규칙·일시 조치의 id — 시간대에 해당해도 더 우선하는 것에 밀리면 빠진다.
 * 전체 대상은 전체 정책에서, 학생 대상은 그 학생의 정책에서 이겼는지로 본다.
 */
export function appliedEntryIds(input: EffectiveInput): Set<string> {
  const applied = new Set<string>();
  if (isPaused(input.pause, input.now)) return applied;
  const candidates = collectCandidates(input);
  const globalCandidates = candidates.filter((c) => c.studentId === null);
  for (const w of pickWinners(globalCandidates)) applied.add(w.id);
  const studentIds = new Set(candidates.map((c) => c.studentId).filter((id): id is string => id !== null));
  for (const id of studentIds) {
    for (const w of pickWinners([...globalCandidates, ...candidates.filter((c) => c.studentId === id)])) {
      if (w.studentId === id) applied.add(w.id);
    }
  }
  return applied;
}

/**
 * 정책이 다음에 바뀌는 시각 (일시 조치 시작·종료, 규칙 시간대 경계, 일시 중지 해제).
 * 없으면 null. 장비는 이 시각이 지나면 정책을 다시 받아 간다.
 */
export function nextChangeAt(input: EffectiveInput): Date | null {
  const { rules, overrides, pause, now } = input;
  const t = now.getTime();
  let best = Infinity;
  const consider = (ms: number) => {
    if (ms > t && ms < best) best = ms;
  };

  if (pause.paused && pause.until) {
    const until = new Date(pause.until).getTime();
    if (!Number.isNaN(until)) consider(until);
  }
  for (const o of overrides) {
    if (o.cancelledAt) continue;
    consider(o.startAt.getTime());
    consider(o.endAt.getTime());
  }

  // KST 오늘 자정(UTC ms)
  const kstMidnight = Math.floor((t + KST_OFFSET_MS) / DAY_MS) * DAY_MS - KST_OFFSET_MS;
  const nextAtMinute = (minute: number) => {
    const today = kstMidnight + minute * 60_000;
    return today > t ? today : today + DAY_MS;
  };
  for (const r of rules) {
    if (!r.enabled) continue;
    if (hasWindow(r)) {
      consider(nextAtMinute(r.startMinute));
      consider(nextAtMinute(r.endMinute));
    } else if (r.daysOfWeek.length > 0) {
      consider(nextAtMinute(0));
    }
  }
  return Number.isFinite(best) ? new Date(best) : null;
}
