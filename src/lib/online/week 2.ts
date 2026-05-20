// 주(week) 관련 유틸. 월요일을 주 시작으로 사용.

/** 주어진 날짜가 속한 주의 월요일을 ISO 날짜 문자열("YYYY-MM-DD")로 반환 (KST 기준). */
export function mondayOfKST(date: Date = new Date()): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const day = kst.getUTCDay(); // 0=일, 1=월, ..., 6=토
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(kst.getTime() + diff * 24 * 60 * 60 * 1000);
  return mon.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" 를 주어진 오프셋(주 단위)만큼 이동. */
export function shiftWeek(isoDate: string, weeks: number): string {
  const d = new Date(isoDate + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" 를 "6/10(월) ~ 6/16(일)" 형식 라벨로. */
export function formatWeekRange(isoMonday: string): string {
  const start = new Date(isoMonday + "T00:00:00.000Z");
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) =>
    `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  return `${fmt(start)}(월) ~ ${fmt(end)}(일)`;
}
