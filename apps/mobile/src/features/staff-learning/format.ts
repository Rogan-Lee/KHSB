// KST 날짜 표기 — 웹 포털(task 상세 등)과 같은 모양: "9월 30일 (수)", "9월 20일 오후 3:12"

const KST_OFFSET = 9 * 60 * 60 * 1000;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const DAY_MS = 86_400_000;

function kst(date: Date) {
  return new Date(date.getTime() + KST_OFFSET);
}

/** KST 날짜 키 "YYYY-MM-DD" */
export function kstDateKey(date = new Date()) {
  return kst(date).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → "9월 25일 목요일" */
export function formatDateKeyLong(dateKey: string) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${WEEKDAYS[d.getUTCDay()]}요일`;
}

/** "YYYY-MM-DD" → "9월 25일 (목)" */
export function formatDateKeyShort(dateKey: string) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`;
}

/** "YYYY-MM-DD" → "9/25" */
export function formatDateKeyCompact(dateKey: string) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/** ISO → "9월 25일 (목)" — 올해가 아니면 연도 포함 */
export function formatDate(iso: string) {
  const k = kst(new Date(iso));
  const thisYear = kst(new Date()).getUTCFullYear();
  const md = `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일 (${WEEKDAYS[k.getUTCDay()]})`;
  return k.getUTCFullYear() === thisYear ? md : `${k.getUTCFullYear()}년 ${md}`;
}

/** ISO → "9월 25일" */
export function formatMonthDay(iso: string) {
  const k = kst(new Date(iso));
  return `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일`;
}

/** ISO → "9월 20일 오후 3:12" */
export function formatDateTime(iso: string) {
  const k = kst(new Date(iso));
  const h = k.getUTCHours();
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const mm = k.getUTCMinutes().toString().padStart(2, '0');
  return `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일 ${h < 12 ? '오전' : '오후'} ${h12}:${mm}`;
}

/** 오늘이면 "오후 3:12", 아니면 "9월 20일" */
export function formatWhen(iso: string, now = new Date()) {
  const date = new Date(iso);
  if (kstDateKey(date) === kstDateKey(now)) {
    const k = kst(date);
    const h = k.getUTCHours();
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h < 12 ? '오전' : '오후'} ${h12}:${k.getUTCMinutes().toString().padStart(2, '0')}`;
  }
  return formatMonthDay(iso);
}

/** 오늘(KST) 기준 남은 날짜 수. 오늘=0, 어제=-1 */
export function daysFromToday(iso: string, now = new Date()) {
  const a = new Date(`${kstDateKey(new Date(iso))}T00:00:00Z`).getTime();
  const b = new Date(`${kstDateKey(now)}T00:00:00Z`).getTime();
  return Math.round((a - b) / DAY_MS);
}
