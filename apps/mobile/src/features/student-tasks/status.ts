// 수행평가 상태 라벨·배지 톤·D-day·KST 날짜 — 웹 학생 포털(src/components/portal/status.ts,
// portal/ui.tsx dueInfo, tasks 페이지 formatDue)과 같은 규칙. 앱과 웹이 같은 문구를 보여야 한다.

import type { Tone } from '@/design';
import type { TaskFeedbackStatus, TaskStatus } from '@/lib/api/student-learning';

type StatusMeta = { label: string; tone: Tone };

export const TASK_STATUS: Record<TaskStatus, StatusMeta> = {
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

/** 제출 완료·최종 완료는 학생이 할 일이 없으므로 D-day 를 강조하지 않는다 */
export const isSettled = (s: TaskStatus) => s === 'DONE' || s === 'SUBMITTED';

/** 웹 dueInfo 와 동일 — D-3 / D-Day / D+2 + 톤 */
export function dueInfo(
  dueDate: string,
  done = false,
  now = Date.now(),
): { label: string; tone: Tone; days: number } {
  const days = Math.ceil((new Date(dueDate).getTime() - now) / 86_400_000);
  const label = days < 0 ? `D+${-days}` : days === 0 ? 'D-Day' : `D-${days}`;
  const tone: Tone = done
    ? 'gray'
    : days < 0
      ? 'bad'
      : days <= 1
        ? 'brand'
        : days <= 3
          ? 'warn'
          : 'gray';
  return { label, tone, days };
}

// ─── KST 날짜 (기기 시간대와 무관하게 웹과 같은 결과) ──────────────────

const KST_OFFSET = 9 * 60 * 60 * 1000;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const kst = (iso: string) => new Date(new Date(iso).getTime() + KST_OFFSET);
const thisYearKST = () => new Date(Date.now() + KST_OFFSET).getUTCFullYear();

/** "9월 30일" — 올해가 아니면 연도 포함 */
export function formatMonthDay(iso: string): string {
  const k = kst(iso);
  const md = `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일`;
  return k.getUTCFullYear() === thisYearKST() ? md : `${k.getUTCFullYear()}년 ${md}`;
}

/** "9월 30일 (수)" — 올해가 아니면 연도 포함 */
export function formatMonthDayWeekday(iso: string): string {
  const k = kst(iso);
  const md = `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일 (${WEEKDAYS[k.getUTCDay()]})`;
  return k.getUTCFullYear() === thisYearKST() ? md : `${k.getUTCFullYear()}년 ${md}`;
}

/** "9월 20일 오후 3:12" */
export function formatDateTimeKST(iso: string): string {
  const k = kst(iso);
  const h = k.getUTCHours();
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const mm = k.getUTCMinutes().toString().padStart(2, '0');
  return `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일 ${h < 12 ? '오전' : '오후'} ${h12}:${mm}`;
}

/** "오후 3:12" */
export function formatTimeKST(iso: string): string {
  const k = kst(iso);
  const h = k.getUTCHours();
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h < 12 ? '오전' : '오후'} ${h12}:${k.getUTCMinutes().toString().padStart(2, '0')}`;
}

/** KST 달력 기준 남은 일수 — 오늘 0, 내일 1 … */
export function kstDaysUntil(iso: string, now = Date.now()): number {
  const DAY = 86_400_000;
  const today = Math.floor((now + KST_OFFSET) / DAY);
  const target = Math.floor((new Date(iso).getTime() + KST_OFFSET) / DAY);
  return target - today;
}

/** "320KB" / "2.4MB" */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export const isImageMime = (mime?: string | null) => !!mime && mime.startsWith('image/');
