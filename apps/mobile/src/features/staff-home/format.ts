// KST 날짜 도우미 — 서버는 날짜를 KST "YYYY-MM-DD" 키로 주고받는다.

const KST_MS = 9 * 60 * 60 * 1000;
export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export function kstTodayKey(now = new Date()) {
  return new Date(now.getTime() + KST_MS).toISOString().slice(0, 10);
}

function keyDate(key: string) {
  return new Date(`${key}T00:00:00Z`);
}

export function addDaysKey(key: string, days: number) {
  const d = keyDate(key);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dayOfWeekKey(key: string) {
  return keyDate(key).getUTCDay();
}

/** 그 주 월요일 */
export function weekStartKey(key: string) {
  const dow = dayOfWeekKey(key);
  return addDaysKey(key, dow === 0 ? -6 : 1 - dow);
}

/** "9월 25일 (목)" · long: "9월 25일 목요일" */
export function formatDateKey(key: string, weekday: 'short' | 'long' | 'none' = 'short') {
  const d = keyDate(key);
  const base = `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
  const w = WEEKDAYS[d.getUTCDay()];
  if (weekday === 'none') return base;
  return weekday === 'long' ? `${base} ${w}요일` : `${base} (${w})`;
}

/** "9월 22일 – 28일" / "9월 29일 – 10월 5일" */
export function formatRangeKey(from: string, to: string) {
  const a = keyDate(from);
  const b = keyDate(to);
  const left = `${a.getUTCMonth() + 1}월 ${a.getUTCDate()}일`;
  const right =
    a.getUTCMonth() === b.getUTCMonth() ? `${b.getUTCDate()}일` : `${b.getUTCMonth() + 1}월 ${b.getUTCDate()}일`;
  return `${left} – ${right}`;
}

/** 시간대별 인사 (KST) — 웹 학생 포털 greeting 과 같은 톤 */
export function greetingText(now = new Date()) {
  const h = new Date(now.getTime() + KST_MS).getUTCHours();
  if (h < 5) return '늦은 시간까지 수고 많아요';
  if (h < 12) return '좋은 아침이에요';
  if (h < 18) return '오후도 힘내요';
  return '오늘 하루도 고생 많았어요';
}

/** ISO → KST "14:02" */
export function kstTime(iso: string) {
  return new Date(new Date(iso).getTime() + KST_MS).toISOString().slice(11, 16);
}

/** ISO → KST "9월 25일 (목) 14:02" */
export function kstDateTime(iso: string) {
  const key = new Date(new Date(iso).getTime() + KST_MS).toISOString().slice(0, 10);
  return `${formatDateKey(key)} ${kstTime(iso)}`;
}

/** ISO → KST 날짜 키 */
export function kstKeyOf(iso: string) {
  return new Date(new Date(iso).getTime() + KST_MS).toISOString().slice(0, 10);
}

/** 마감일 키 → "오늘까지" / "내일까지" / "3일 지남" / "9월 30일까지" */
export function dueLabel(dueKey: string, todayKey = kstTodayKey()) {
  const diff = Math.round((keyDate(dueKey).getTime() - keyDate(todayKey).getTime()) / 86_400_000);
  if (diff === 0) return { label: '오늘까지', overdue: false, soon: true };
  if (diff === 1) return { label: '내일까지', overdue: false, soon: true };
  if (diff < 0) return { label: `${-diff}일 지남`, overdue: true, soon: false };
  return { label: `${formatDateKey(dueKey, 'none')}까지`, overdue: false, soon: false };
}

/**
 * 웹에서 마크다운으로 쓴 공지를 앱에서 읽기 좋게 — 서식 기호만 걷어 낸 일반 텍스트.
 * (앱에는 마크다운 렌더러가 없어 굵게·제목 등은 표시하지 않는다)
 */
export function plainMarkdown(md: string) {
  return md
    .replace(/\r\n/g, '\n')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/^\s*[-*+]\s+\[( |x|X)\]\s+/gm, (_m, c: string) => (c.trim() ? '☑ ' : '☐ '))
    .replace(/^(\s*)[-*+]\s+/gm, '$1• ')
    .replace(/^>\s?/gm, '')
    .replace(/^-{3,}$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
