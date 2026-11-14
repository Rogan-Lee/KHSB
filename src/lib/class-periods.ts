// 자습실 교시표 — 랜딩(landing/care-life.html "교시제")과 같은 값.
// 학기 중 평일은 하교 후 16시부터, 방학·주말은 09시부터 24시까지.

export type ClassPeriod = { no: number; start: string; end: string }; // "HH:MM" KST, 24시는 "24:00"

const SEMESTER_WEEKDAY: ClassPeriod[] = [
  { no: 1, start: "16:00", end: "16:50" },
  { no: 2, start: "17:00", end: "17:50" },
  { no: 3, start: "18:00", end: "18:50" },
  { no: 4, start: "19:00", end: "19:50" },
  { no: 5, start: "20:00", end: "20:50" },
  { no: 6, start: "21:00", end: "21:50" },
  { no: 7, start: "22:00", end: "22:50" },
  { no: 8, start: "23:00", end: "24:00" },
];

const VACATION: ClassPeriod[] = [
  { no: 1, start: "09:00", end: "10:30" },
  { no: 2, start: "10:40", end: "12:10" },
  { no: 3, start: "13:20", end: "14:50" },
  { no: 4, start: "15:00", end: "16:30" },
  { no: 5, start: "16:40", end: "18:10" },
  // ponytail: 랜딩엔 "6–9교시 19:20–24:00" 만 있어 1시간 단위로 나눈 추정값 — 원장님 시간표 받으면 교체
  { no: 6, start: "19:20", end: "20:20" },
  { no: 7, start: "20:30", end: "21:30" },
  { no: 8, start: "21:40", end: "22:40" },
  { no: 9, start: "22:50", end: "24:00" },
];

// 방학표를 쓰는 기간 (양 끝 포함). 주말은 늘 방학표.
// ponytail: 기간 하드코딩 — 여름 방학 등 시즌이 늘면 여기 한 줄 추가, 잦아지면 AppSetting 으로
const VACATION_RANGES: [string, string][] = [
  ["2027-01-01", "2027-02-28"], // 2027 윈터스쿨
];

/** "YYYY-MM-DD" 가 방학표를 쓰는 날인지 (방학 기간 또는 토·일). */
export function isVacationDay(date: string): boolean {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (dow === 0 || dow === 6) return true;
  return VACATION_RANGES.some(([from, to]) => from <= date && date <= to);
}

export function periodsFor(date: string): ClassPeriod[] {
  return isVacationDay(date) ? VACATION : SEMESTER_WEEKDAY;
}

/** 운영진 상주 시작 시각 — 학기 중 평일 16시, 방학·주말 09시 (첫 교시 시작). */
export function staffDayStart(date: string): string {
  return periodsFor(date)[0].start;
}

/** 지금 검사할 교시 번호 — 시작한 교시 중 가장 늦은 것, 첫 교시 전이면 0(입실). */
export function currentPeriodNo(date: string, hhmm: string): number {
  let no = 0;
  for (const p of periodsFor(date)) if (p.start <= hhmm) no = p.no;
  return no;
}
