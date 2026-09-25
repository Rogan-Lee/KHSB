import { color } from '@/design';
import type { AttendanceSlot, CalendarEvent, OutingSlot } from '@/lib/api/student-plan';

// 내 일정 · 등원 스케줄 · 모의고사 — 웹 포털(my-schedule-panel, schedule-slots-editor portal)과 같은 표기.

export const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

/** 월요일부터 (웹 편집기 DAYS 순서) */
export const WEEK_DAYS: { value: number; label: string }[] = [
  { value: 1, label: '월' },
  { value: 2, label: '화' },
  { value: 3, label: '수' },
  { value: 4, label: '목' },
  { value: 5, label: '금' },
  { value: 6, label: '토' },
  { value: 0, label: '일' },
];

export const DAY_FULL: Record<number, string> = {
  0: '일요일',
  1: '월요일',
  2: '화요일',
  3: '수요일',
  4: '목요일',
  5: '금요일',
  6: '토요일',
};

export const EVENT_TYPE_LABEL: Record<string, string> = {
  SCHOOL_EXAM: '학교 시험',
  SCHOOL_EVENT: '학교 행사',
  PERSONAL: '개인 일정',
  PLATFORM: '플랫폼',
};

// 시간표 colorCode(DB 값) → 점/바 색 (웹과 같은 매핑: SEED 역할 토큰, pink/teal 만 Tailwind 기본색)
const DOT_COLORS: Record<string, string> = {
  blue: color.bg.informativeSolid,
  red: color.bg.criticalSolid,
  orange: color.bg.brandSolid,
  yellow: color.bg.warningSolid,
  green: color.bg.positiveSolid,
  purple: color.palette.purple600,
  pink: '#f472b6',
  teal: '#2dd4bf',
};

/** 학교/개인 일정(캘린더 이벤트) 점·바 색 */
export const EVENT_DOT = color.palette.gray600;

export function dotColor(code: string): string {
  return DOT_COLORS[code] ?? DOT_COLORS.blue;
}

// ── 날짜 ───────────────────────────────────────────────────────────────

/** "YYYY-MM-DD" 의 요일 (0=일) */
export function dowOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

export function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return new Date(d.getTime() + n * 86_400_000).toISOString().slice(0, 10);
}

/** ISO datetime → KST 기준 "YYYY-MM-DD" */
export function kstDateStr(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

export function eventsOn(events: CalendarEvent[], dateStr: string): CalendarEvent[] {
  return events.filter((ev) => {
    const start = kstDateStr(ev.startDate);
    const end = ev.endDate ? kstDateStr(ev.endDate) : start;
    return start <= dateStr && dateStr <= end;
  });
}

/** "YYYY-MM-DD" → "9월 24일" */
export function fmtMonthDay(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}월 ${d}일`;
}

/** "YYYY-MM-DD" → "9월 24일 수요일" */
export function fmtDateLong(dateStr: string): string {
  return `${fmtMonthDay(dateStr)} ${DAY_LABELS[dowOf(dateStr)]}요일`;
}

/** "YYYY-MM-DD" → "9월 24일 (수)" */
export function fmtDateShort(dateStr: string): string {
  return `${fmtMonthDay(dateStr)} (${DAY_LABELS[dowOf(dateStr)]})`;
}

/** ISO → KST "9월 24일" */
export function fmtKstDate(iso: string): string {
  return fmtMonthDay(kstDateStr(iso));
}

/** 오늘(KST)부터 며칠 남았는지 — 지난 날짜면 음수 */
export function daysFromToday(dateStr: string, now = new Date()): number {
  const today = kstDateStr(now.toISOString());
  const a = new Date(`${today}T00:00:00Z`).getTime();
  const b = new Date(`${dateStr}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

// ── 시간 ───────────────────────────────────────────────────────────────

export function toMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** "9시간 30분" — 끝이 시작보다 늦을 때만 */
export function durationLabel(start: string, end: string): string | null {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s == null || e == null || e <= s) return null;
  const h = Math.floor((e - s) / 60);
  const m = (e - s) % 60;
  return h === 0 ? `${m}분` : m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

export function isRangeValid(start: string, end: string): boolean {
  const s = toMinutes(start);
  const e = toMinutes(end);
  return s != null && e != null && e > s;
}

const WEEK_ORDER = WEEK_DAYS.map((d) => d.value);

export function sortAttendance(list: AttendanceSlot[]): AttendanceSlot[] {
  return [...list].sort(
    (a, b) =>
      WEEK_ORDER.indexOf(a.dayOfWeek) - WEEK_ORDER.indexOf(b.dayOfWeek) ||
      a.startTime.localeCompare(b.startTime),
  );
}

export function sortOutings(list: OutingSlot[]): OutingSlot[] {
  return [...list].sort(
    (a, b) =>
      WEEK_ORDER.indexOf(a.dayOfWeek) - WEEK_ORDER.indexOf(b.dayOfWeek) ||
      a.outStart.localeCompare(b.outStart),
  );
}

/** 공부 계획 항목 id (서버가 40자로 자름) */
export function newPlanId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
