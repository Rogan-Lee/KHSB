import type { Tone } from '@/design';
import type {
  MentoringState,
  StaffTaskStatus,
  TaskFeedbackStatus,
  VocabAttemptStatus,
} from '@/lib/api/staff-learning';

import { daysFromToday } from './format';

type StatusMeta = { label: string; tone: Tone };

// 웹 포털 src/components/portal/status.ts 와 같은 라벨·톤
export const TASK_STATUS: Record<StaffTaskStatus, StatusMeta> = {
  OPEN: { label: '진행 전', tone: 'gray' },
  IN_PROGRESS: { label: '진행 중', tone: 'info' },
  SUBMITTED: { label: '제출 완료', tone: 'warn' },
  NEEDS_REVISION: { label: '수정 필요', tone: 'bad' },
  DONE: { label: '최종 완료', tone: 'ok' },
};

export const FEEDBACK_STATUS: Record<TaskFeedbackStatus, StatusMeta> = {
  COMMENT: { label: '코멘트', tone: 'gray' },
  NEEDS_REVISION: { label: '수정 요청', tone: 'bad' },
  APPROVED: { label: '승인', tone: 'ok' },
};

export const MENTORING_STATE: Record<MentoringState, StatusMeta> = {
  SCHEDULED: { label: '예정', tone: 'info' },
  NEEDS_RECORD: { label: '기록 필요', tone: 'bad' },
  COMPLETED: { label: '완료', tone: 'ok' },
};

export const VOCAB_STATUS: Record<VocabAttemptStatus, StatusMeta> = {
  ASSIGNED: { label: '미응시', tone: 'gray' },
  IN_PROGRESS: { label: '응시 중', tone: 'info' },
  SUBMITTED: { label: '제출 완료', tone: 'ok' },
  EXPIRED: { label: '취소됨', tone: 'bad' },
};

/** 마감 D-day — 웹 포털 dueInfo 와 같은 규칙 */
export function dueInfo(dueDate: string, done = false): { label: string; tone: Tone; days: number } {
  const days = daysFromToday(dueDate);
  const label = days < 0 ? `D+${-days}` : days === 0 ? 'D-Day' : `D-${days}`;
  const tone: Tone = done ? 'gray' : days < 0 ? 'bad' : days <= 1 ? 'brand' : days <= 3 ? 'warn' : 'gray';
  return { label, tone, days };
}

/** 점수 톤 — 90↑ 좋음, 70↑ 보통, 그 아래 주의 */
export function scoreTone(score: number | null): 'positive' | 'neutral' | 'critical' {
  if (score == null) return 'neutral';
  if (score >= 90) return 'positive';
  if (score >= 70) return 'neutral';
  return 'critical';
}
