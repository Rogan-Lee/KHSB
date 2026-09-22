import { describe, it, expect } from "vitest";
import {
  stayMs,
  weekStartOf,
  buildAttendanceTimeStats,
  type AttendanceInterval,
} from "@/lib/attendance-stats";

const HOUR = 60 * 60 * 1000;
const kst = (dateStr: string, time: string) => new Date(`${dateStr}T${time}:00+09:00`);

function rec(partial: Partial<AttendanceInterval> & { date: string }): AttendanceInterval {
  return {
    studentId: "s1",
    studentName: "김철수",
    checkIn: null,
    checkOut: null,
    outStart: null,
    outEnd: null,
    ...partial,
  };
}

describe("stayMs", () => {
  it("checkIn~checkOut 재원 시간 계산 (자정 넘김 없음)", () => {
    expect(
      stayMs({ checkIn: kst("2026-09-14", "10:00"), checkOut: kst("2026-09-14", "18:00") })
    ).toBe(8 * HOUR);
  });

  it("외출(outStart~outEnd) 시간을 차감한다", () => {
    expect(
      stayMs({
        checkIn: kst("2026-09-14", "10:00"),
        checkOut: kst("2026-09-14", "18:00"),
        outStart: kst("2026-09-14", "12:00"),
        outEnd: kst("2026-09-14", "13:00"),
      })
    ).toBe(7 * HOUR);
  });

  it("checkOut 없는 미완료 기록은 null (통계 제외)", () => {
    expect(stayMs({ checkIn: kst("2026-09-14", "10:00"), checkOut: null })).toBeNull();
  });
});

describe("buildAttendanceTimeStats", () => {
  it("일별/요일별/학생별 통계를 집계하고 미완료 기록은 제외한다", () => {
    const records: AttendanceInterval[] = [
      // 2026-09-14 = 월요일
      rec({ date: "2026-09-14", checkIn: kst("2026-09-14", "10:00"), checkOut: kst("2026-09-14", "18:00") }), // 8h
      rec({
        studentId: "s2",
        studentName: "이영희",
        date: "2026-09-14",
        checkIn: kst("2026-09-14", "14:00"),
        checkOut: kst("2026-09-14", "20:00"),
      }), // 6h
      rec({ date: "2026-09-15", checkIn: kst("2026-09-15", "09:00"), checkOut: kst("2026-09-15", "13:00") }), // 4h (화)
      rec({ date: "2026-09-16", checkIn: kst("2026-09-16", "09:00"), checkOut: null }), // 미완료 → 제외
    ];

    const stats = buildAttendanceTimeStats(records);

    // 일별 평균 (날짜 오름차순)
    expect(stats.daily).toEqual([
      { date: "2026-09-14", avgHours: 7, count: 2 },
      { date: "2026-09-15", avgHours: 4, count: 1 },
    ]);

    // 요일별 — 월(평균 입실 12:00, 7h), 화(09:00, 4h), 나머지 null
    const mon = stats.weekday.find((w) => w.day === 1)!;
    expect(mon).toMatchObject({ label: "월", avgCheckIn: "12:00", avgHours: 7, count: 2 });
    const tue = stats.weekday.find((w) => w.day === 2)!;
    expect(tue).toMatchObject({ avgCheckIn: "09:00", avgHours: 4, count: 1 });
    expect(stats.weekday).toHaveLength(7);
    expect(stats.weekday.find((w) => w.day === 3)).toMatchObject({ avgCheckIn: null, avgHours: null, count: 0 });

    // 학생별 — 합계 내림차순
    expect(stats.students).toEqual([
      { studentId: "s1", studentName: "김철수", totalHours: 12, avgHours: 6, days: 2 },
      { studentId: "s2", studentName: "이영희", totalHours: 6, avgHours: 6, days: 1 },
    ]);
  });

  it("weekStartOf — 해당 주 월요일을 반환한다", () => {
    expect(weekStartOf("2026-09-14")).toBe("2026-09-14"); // 월
    expect(weekStartOf("2026-09-20")).toBe("2026-09-14"); // 일
    expect(weekStartOf("2026-09-21")).toBe("2026-09-21"); // 다음 주 월
  });
});
