// 재원(등원) 시간 통계 — 순수 계산 로직. analytics 서버 액션에서 사용.
import { DAY_NAMES } from "@/lib/utils";

const HOUR_MS = 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * HOUR_MS;

export interface AttendanceInterval {
  studentId: string;
  studentName: string;
  date: string; // "YYYY-MM-DD" (KST 기준 날짜)
  checkIn: Date | null;
  checkOut: Date | null;
  outStart: Date | null;
  outEnd: Date | null;
}

export interface DailyStayAvg {
  date: string;
  avgHours: number;
  count: number; // 해당일 완료 기록 수
}

export interface WeekdayStayAvg {
  day: number; // 0=일 ... 6=토
  label: string;
  avgCheckIn: string | null; // "HH:MM" (KST)
  avgHours: number | null;
  count: number;
}

export interface StudentStayStat {
  studentId: string;
  studentName: string;
  totalHours: number; // 기간 내 합계
  avgHours: number; // 등원일 평균
  days: number; // 등원(완료 기록) 일수
}

export interface AttendanceTimeStats {
  daily: DailyStayAvg[];
  weekday: WeekdayStayAvg[];
  students: StudentStayStat[]; // 합계 내림차순 (상위/하위는 앞/뒤에서 slice)
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * 완료된 기록(checkIn+checkOut 모두 존재)의 재원 시간(ms).
 * 외출(outStart~outEnd)이 재원 구간과 겹치는 만큼 차감.
 * 미완료·비정상(0 이하, 24h 이상) 기록은 null — 통계에서 제외.
 */
export function stayMs(r: {
  checkIn: Date | null;
  checkOut: Date | null;
  outStart?: Date | null;
  outEnd?: Date | null;
}): number | null {
  if (!r.checkIn || !r.checkOut) return null;
  let ms = r.checkOut.getTime() - r.checkIn.getTime();
  if (ms <= 0 || ms >= 24 * HOUR_MS) return null; // 기존 analytics와 동일한 이상치 가드
  if (r.outStart && r.outEnd) {
    const s = Math.max(r.outStart.getTime(), r.checkIn.getTime());
    const e = Math.min(r.outEnd.getTime(), r.checkOut.getTime());
    if (e > s) ms -= e - s;
  }
  return ms;
}

/** "YYYY-MM-DD" → 해당 주 월요일 "YYYY-MM-DD" */
export function weekStartOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** UTC Date의 KST 기준 자정 이후 경과 분 */
function kstMinutes(d: Date): number {
  return (((d.getTime() + KST_OFFSET_MS) % (24 * HOUR_MS)) + 24 * HOUR_MS) % (24 * HOUR_MS) / 60000;
}

function formatMinutes(min: number): string {
  const m = Math.round(min);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function buildAttendanceTimeStats(records: AttendanceInterval[]): AttendanceTimeStats {
  const byDate = new Map<string, { totalMs: number; count: number }>();
  const byWeekday = new Map<number, { totalMs: number; checkInMin: number; count: number }>();
  const byStudent = new Map<string, { studentName: string; totalMs: number; days: number }>();

  for (const r of records) {
    const ms = stayMs(r);
    if (ms === null || !r.checkIn) continue;

    const d = byDate.get(r.date) ?? { totalMs: 0, count: 0 };
    d.totalMs += ms;
    d.count += 1;
    byDate.set(r.date, d);

    const day = new Date(`${r.date}T00:00:00Z`).getUTCDay();
    const w = byWeekday.get(day) ?? { totalMs: 0, checkInMin: 0, count: 0 };
    w.totalMs += ms;
    w.checkInMin += kstMinutes(r.checkIn);
    w.count += 1;
    byWeekday.set(day, w);

    const s = byStudent.get(r.studentId) ?? { studentName: r.studentName, totalMs: 0, days: 0 };
    s.totalMs += ms;
    s.days += 1;
    byStudent.set(r.studentId, s);
  }

  const daily: DailyStayAvg[] = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, avgHours: round1(v.totalMs / v.count / HOUR_MS), count: v.count }));

  // 월~일 순서로 7일 모두 출력 (기록 없는 요일은 null)
  const weekday: WeekdayStayAvg[] = [1, 2, 3, 4, 5, 6, 0].map((day) => {
    const v = byWeekday.get(day);
    return {
      day,
      label: DAY_NAMES[day],
      avgCheckIn: v ? formatMinutes(v.checkInMin / v.count) : null,
      avgHours: v ? round1(v.totalMs / v.count / HOUR_MS) : null,
      count: v?.count ?? 0,
    };
  });

  const students: StudentStayStat[] = [...byStudent.entries()]
    .map(([studentId, v]) => ({
      studentId,
      studentName: v.studentName,
      totalHours: round1(v.totalMs / HOUR_MS),
      avgHours: round1(v.totalMs / v.days / HOUR_MS),
      days: v.days,
    }))
    .sort((a, b) => b.totalHours - a.totalHours);

  return { daily, weekday, students };
}
