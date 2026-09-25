import type { Tone } from '@/design';

// 학부모 리포트·성장 탭 날짜 표기 — 기기 시간대와 무관하게 KST 기준.
//  · 시각(ISO)          → kstParts(iso)
//  · 날짜 키(YYYY-MM-DD) → dayParts(key)  (서버가 @db.Date 를 그대로 보냄)

const KST_OFFSET = 9 * 60 * 60 * 1000;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

type Parts = { y: number; m: number; d: number; w: number };

export function kstParts(iso: string): Parts {
  const k = new Date(new Date(iso).getTime() + KST_OFFSET);
  return { y: k.getUTCFullYear(), m: k.getUTCMonth() + 1, d: k.getUTCDate(), w: k.getUTCDay() };
}

export function dayParts(key: string): Parts {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m, d, w: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** 오늘(KST) "YYYY-MM-DD" */
export function todayKey(now = Date.now()) {
  return new Date(now + KST_OFFSET).toISOString().slice(0, 10);
}

const thisYear = () => kstParts(new Date().toISOString()).y;

/** "9월 24일 (수)" — 올해가 아니면 "2025년 9월 24일 (수)" */
function dayLabel(p: Parts) {
  const md = `${p.m}월 ${p.d}일 (${WEEKDAYS[p.w]})`;
  return p.y === thisYear() ? md : `${p.y}년 ${md}`;
}

/** 시각 ISO → "9월 24일 (수)" */
export const formatReportDate = (iso: string) => dayLabel(kstParts(iso));

/** 날짜 키 → "9월 24일 (수)" */
export const formatDayKey = (key: string) => dayLabel(dayParts(key));

/** 날짜 키 → "2026년 9월 24일 수요일" (리포트 머리 카드) */
export function formatDayKeyLong(key: string) {
  const p = dayParts(key);
  return `${p.y}년 ${p.m}월 ${p.d}일 ${WEEKDAYS[p.w]}요일`;
}

/** 시각 ISO → "2026년 9월 24일 수요일" (KST) */
export function formatReportDateLong(iso: string) {
  const p = kstParts(iso);
  return `${p.y}년 ${p.m}월 ${p.d}일 ${WEEKDAYS[p.w]}요일`;
}

/** 날짜 키 → "9월 24일" */
export function monthDayOfKey(key: string) {
  const p = dayParts(key);
  return `${p.m}월 ${p.d}일`;
}

/** 시각 ISO → "9월 24일" (KST) */
export function monthDayOfIso(iso: string) {
  const p = kstParts(iso);
  return `${p.m}월 ${p.d}일`;
}

/** 날짜 키 → "9.24" (차트 축) */
export function shortDayKey(key: string) {
  const p = dayParts(key);
  return `${p.m}.${p.d}`;
}

/** 시각 ISO → 월 묶음 키 "YYYY-MM" (KST) */
export function monthKeyOf(iso: string) {
  const p = kstParts(iso);
  return `${p.y}-${String(p.m).padStart(2, '0')}`;
}

/** "YYYY-MM" → "9월" (올해) / "2025년 12월" */
export function formatMonthKey(key: string) {
  const [y, m] = key.split('-').map(Number);
  return y === thisYear() ? `${m}월` : `${y}년 ${m}월`;
}

/** 마감 D-day — 학생 앱 dueInfo 와 같은 문구·톤, 날짜는 KST 달력 기준 */
export function dueLabel(key: string, settled = false): { label: string; tone: Tone; days: number } {
  const a = dayParts(key);
  const b = dayParts(todayKey());
  const days = Math.round((Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d)) / 86_400_000);
  const label = days < 0 ? `D+${-days}` : days === 0 ? 'D-Day' : `D-${days}`;
  const tone: Tone = settled ? 'gray' : days < 0 ? 'bad' : days <= 1 ? 'brand' : days <= 3 ? 'warn' : 'gray';
  return { label, tone, days };
}

/** 소수 첫째 자리까지, 정수면 소수점 없이 */
export function formatDecimal(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
