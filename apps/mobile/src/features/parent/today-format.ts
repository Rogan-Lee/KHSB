import { color, type Tone } from '@/design';
import type { ParentDay } from '@/lib/api/parent-today';

// 학부모 오늘·출결 화면 공용 — KST 날짜·시간 표기와 출결 상태 → 배지/색.

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

const KST_MS = 9 * 60 * 60 * 1000;

/** 오늘 (KST) YYYY-MM-DD */
export function kstToday(now = new Date()): string {
  return new Date(now.getTime() + KST_MS).toISOString().slice(0, 10);
}

/** ISO → "09:12" (KST) */
export function hm(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + KST_MS).toISOString().slice(11, 16);
}

export function hmToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** 분 → "9시간 30분" / "40분" / "0분" */
export function duration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

function parts(key: string) {
  const d = new Date(`${key}T00:00:00Z`);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), w: d.getUTCDay() };
}

/** "9월 24일 수요일" */
export function dayTitle(key: string): string {
  const p = parts(key);
  return `${p.m}월 ${p.d}일 ${WEEKDAYS[p.w]}요일`;
}

/** "9월 24일 (수)" */
export function dayShort(key: string): string {
  const p = parts(key);
  return `${p.m}월 ${p.d}일 (${WEEKDAYS[p.w]})`;
}

/** "2026년 9월" */
export function monthTitle(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${y}년 ${m}월`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

/** "9월 22일 – 28일" · 달이 넘어가면 "9월 29일 – 10월 5일" */
export function rangeTitle(start: string, end: string): string {
  const a = parts(start);
  const b = parts(end);
  return a.m === b.m ? `${a.m}월 ${a.d}일 – ${b.d}일` : `${a.m}월 ${a.d}일 – ${b.m}월 ${b.d}일`;
}

/** 시간 차이 문장 — "1시간 20분 더 했어요" / "40분 덜 했어요" / "비슷해요" */
export function compareText(diff: number): { text: string; direction: 'up' | 'down' | 'same' } {
  if (Math.abs(diff) < 10) return { text: '비슷해요', direction: 'same' };
  return diff > 0
    ? { text: `${duration(diff)} 더 했어요`, direction: 'up' }
    : { text: `${duration(-diff)} 덜 했어요`, direction: 'down' };
}

// ─── 출결 배지 ───────────────────────────────────────────────────────

export type DayMark = { tone: Tone; label: string };

/** 하루 출결을 한 단어로 — 달력 점·상세 배지. 기록이 없으면 null */
export function dayMark(day: Pick<ParentDay, 'type' | 'isLate' | 'checkIn' | 'status'>): DayMark | null {
  switch (day.type) {
    case 'ABSENT':
      return { tone: 'bad', label: '결석' };
    case 'APPROVED_ABSENT':
      return { tone: 'gray', label: '허가 결석' };
    case 'NOTIFIED_ABSENT':
      return { tone: 'gray', label: '사전 연락 결석' };
    case 'EARLY_LEAVE':
      return { tone: 'violet', label: '조퇴' };
    default:
      break;
  }
  if (day.isLate) return { tone: 'warn', label: '지각' };
  if (day.checkIn) return { tone: 'ok', label: '출석' };
  return null;
}

/** 달력 점·타임라인 색 — 흰 바탕에서 잘 보이는 전경 토큰 (색만으로 구분하지 않게 범례·배지와 함께 쓴다) */
export const MARK_COLOR: Record<Tone, string> = {
  ok: color.fg.positive,
  warn: color.fg.warning,
  bad: color.fg.critical,
  gray: color.palette.gray600,
  violet: color.palette.purple700,
  info: color.fg.informative,
  brand: color.fg.brand,
};

/** 마크다운 공지를 평문으로 (목록 미리보기·시트 본문) */
export function plainText(markdown: string): string {
  return markdown
    .replace(/\r\n/g, '\n')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
