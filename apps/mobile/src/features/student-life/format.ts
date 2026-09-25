// 학생 생활 화면(포인트·쪽잠·네트워크) 날짜·숫자 표기 — 웹 포털 패널과 같은 고정 포맷(KST).
// 로케일(Intl) 차이 없이 UTC+9 산술로 계산한다.

const KST_OFFSET = 9 * 60 * 60 * 1000;
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

const pad = (n: number) => String(n).padStart(2, '0');

/** 지금 KST "HH:MM" */
export function nowKSTTime(): string {
  return new Date(Date.now() + KST_OFFSET).toISOString().slice(11, 16);
}

/** 오늘 KST "YYYY-MM-DD" */
export function todayKSTStr(): string {
  return new Date(Date.now() + KST_OFFSET).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" 에 n일 더하기 */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → 요일 "수" */
export function weekdayOf(date: string): string {
  return DOW[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

/** "YYYY-MM-DD" → "9월 24일 (수)" (웹 nap-panel fmtDate) */
export function fmtDateDow(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}월 ${d}일 (${weekdayOf(date)})`;
}

/** ISO → KST "9월 24일" (웹 points-panel fmtDate) */
export function fmtMonthDay(iso: string): string {
  const d = new Date(new Date(iso).getTime() + KST_OFFSET);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

/** ISO → KST 월/일/시각 */
function kstParts(iso: string) {
  const d = new Date(new Date(iso).getTime() + KST_OFFSET);
  return { m: d.getUTCMonth() + 1, day: d.getUTCDate(), hm: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` };
}

/** "9월 24일 14:00 ~ 16:00" (웹 network-panel fmtRange) */
export function fmtRange(startIso: string, endIso: string): string {
  const s = kstParts(startIso);
  const e = kstParts(endIso);
  return `${s.m}월 ${s.day}일 ${s.hm} ~ ${e.hm}`;
}

/** 1,250점 */
export function fmtPoints(points: number): string {
  return `${points.toLocaleString('ko-KR')}점`;
}

/** 약 500,000원 */
export function fmtKrw(krw: number): string {
  return `약 ${krw.toLocaleString('ko-KR')}원`;
}

/** "HH:MM" → 분 */
export function timeToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}
