// 학부모 신청·소통 화면 공용 날짜 표기 — KST 기준, Intl 없이 계산(기기 로캘·타임존과 무관).

const KST_MS = 9 * 60 * 60 * 1000;
export const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

function kst(iso: string) {
  return new Date(new Date(iso).getTime() + KST_MS);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 오늘 KST YYYY-MM-DD */
export function kstTodayKey(now = new Date()) {
  return new Date(now.getTime() + KST_MS).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → "9월 29일 (월)" */
export function ymdLabel(ymd: string, withDow = true) {
  const d = new Date(`${ymd}T00:00:00Z`);
  const base = `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
  return withDow ? `${base} (${DOW_KO[d.getUTCDay()]})` : base;
}

/** ISO → "9월 25일 14:03" (올해가 아니면 연도 포함) */
export function kstDateTimeLabel(iso: string) {
  const d = kst(iso);
  const thisYear = kst(new Date().toISOString()).getUTCFullYear();
  const y = d.getUTCFullYear() !== thisYear ? `${d.getUTCFullYear()}년 ` : '';
  return `${y}${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** ISO → "9월 25일" (올해가 아니면 연도 포함) */
export function kstDateLabel(iso: string) {
  const d = kst(iso);
  const thisYear = kst(new Date().toISOString()).getUTCFullYear();
  const y = d.getUTCFullYear() !== thisYear ? `${d.getUTCFullYear()}년 ` : '';
  return `${y}${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

/** 방금 전 · N분 전 · N시간 전 · 어제 · 9월 25일 */
export function kstRelativeLabel(iso: string, now = new Date()) {
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  if (min < 24 * 60 && kstTodayKey(new Date(iso)) === kstTodayKey(now)) return `${Math.floor(min / 60)}시간 전`;
  const yesterday = kstTodayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  if (kstTodayKey(new Date(iso)) === yesterday) return '어제';
  return kstDateLabel(iso);
}

/** 시험·적용일까지 남은 날 (오늘 0) */
export function daysUntil(ymd: string, now = new Date()) {
  const today = new Date(`${kstTodayKey(now)}T00:00:00Z`).getTime();
  const target = new Date(`${ymd}T00:00:00Z`).getTime();
  return Math.round((target - today) / 86_400_000);
}
