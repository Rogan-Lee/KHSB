// 순공(공부) 시간 계산 코어 — 서버 액션(src/actions/reports.ts)과 모바일 API 가 같이 쓴다.
// 순수 함수만 둔다 (Prisma 없음).

type AttendanceWithTimes = {
  checkIn: Date | null;
  checkOut: Date | null;
  outStart: Date | null;
  outEnd: Date | null;
};

/**
 * 두 DateTime 차이를 분 단위로 반환 (음수면 0).
 */
export function diffMinutes(from: Date | null, to: Date | null): number {
  if (!from || !to) return 0;
  const diff = (to.getTime() - from.getTime()) / (1000 * 60);
  return Math.max(Math.round(diff), 0);
}

/**
 * 하루의 순공 시간을 분 단위로 계산.
 * checkIn~checkOut 간격에서 outStart~outEnd 구간을 차감.
 * (월간 리포트 집계용 — 웹 동작 그대로)
 */
export function calcStudyMinutes(record: AttendanceWithTimes): number {
  const total = diffMinutes(record.checkIn, record.checkOut);
  if (total === 0) return 0;
  const outing = diffMinutes(record.outStart, record.outEnd);
  return Math.max(total - outing, 0);
}

// ─── 하루 단위 정밀 계산 (학부모 앱) ─────────────────────────────────

type Interval = { start: number; end: number };

const DAY_MS = 24 * 60 * 60 * 1000;

function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const cur of sorted) {
    const last = merged[merged.length - 1];
    if (last && cur.start <= last.end) last.end = Math.max(last.end, cur.end);
    else merged.push({ ...cur });
  }
  return merged;
}

/**
 * 하루 순공 시간(분) — 체류(입실~퇴실, 진행 중이면 지금까지)에서 외출 구간 합집합을 뺀 값.
 *  · 1차 외출은 DailyOuting(sequence 1)과 AttendanceRecord.outStart/outEnd 에 함께 기록(미러)되므로
 *    구간을 합집합으로 합쳐 한 번만 뺀다.
 *  · 진행 중 외출(outEnd 없음)은 체류 끝(퇴실 또는 지금)까지 외출로 본다.
 *  · 비정상(0 이하 / 24시간 이상) 체류는 0.
 */
export function dayStudyMinutes(
  record: AttendanceWithTimes | null | undefined,
  outings: { outStart: Date | null; outEnd: Date | null }[],
  options: { now?: Date; live?: boolean } = {},
): number {
  const now = options.now ?? new Date();
  if (!record?.checkIn) return 0;
  // 퇴실 기록이 없으면: 오늘(live)은 지금까지, 지난 날은 집계하지 않음(웹 월간 집계와 동일)
  if (!record.checkOut && !options.live) return 0;
  const start = record.checkIn.getTime();
  const end = record.checkOut ? record.checkOut.getTime() : now.getTime();
  if (end <= start || end - start >= DAY_MS) return 0;

  const raw: Interval[] = [];
  const push = (s: Date | null, e: Date | null) => {
    if (!s) return;
    const from = Math.max(s.getTime(), start);
    const to = Math.min((e ?? now).getTime(), end);
    if (to > from) raw.push({ start: from, end: to });
  };
  push(record.outStart, record.outEnd);
  for (const o of outings) push(o.outStart, o.outEnd);

  const away = mergeIntervals(raw).reduce((sum, i) => sum + (i.end - i.start), 0);
  return Math.max(Math.round((end - start - away) / 60000), 0);
}
