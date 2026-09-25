// 월간 리포트 날짜·숫자 표기 — 서버가 날짜를 "YYYY-MM-DD"(달력 날짜)로 보내므로 기기 시간대와 무관.

function parts(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m, d };
}

/** "2026-09-03" → "2026년 9월 3일" */
export function longDay(key: string) {
  const p = parts(key);
  return `${p.y}년 ${p.m}월 ${p.d}일`;
}

/** "2026-09-03" → "9월 3일" */
export function monthDay(key: string) {
  const p = parts(key);
  return `${p.m}월 ${p.d}일`;
}

/** "2026-09-03" → "9/3" (차트 축) */
export function slashDay(key: string) {
  const p = parts(key);
  return `${p.m}/${p.d}`;
}

/** 소수 둘째 자리까지, 끝의 0 은 떼고 */
export function num(v: number) {
  return String(Math.round(v * 100) / 100);
}
