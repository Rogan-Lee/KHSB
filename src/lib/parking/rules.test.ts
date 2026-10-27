import { describe, expect, it } from "vitest";

import { addDays, checkParkingAttempt, normalizeCarNo, PARKING_RULES, type ParkingHistoryRow } from "./rules";

const TODAY = "2026-10-27";
const base = { studentId: "s1", authUserId: "p1", carNo: "12가3456", today: TODAY, hour: 21 };
const row = (over: Partial<ParkingHistoryRow> = {}): ParkingHistoryRow => ({
  studentId: "s1",
  authUserId: "p1",
  carNo: "12가3456",
  date: TODAY,
  status: "OK",
  flags: [],
  ...over,
});

describe("normalizeCarNo", () => {
  it("공백·하이픈을 지우고 형식을 확인한다", () => {
    expect(normalizeCarNo(" 12가 3456 ")).toBe("12가3456");
    expect(normalizeCarNo("123-가-4567")).toBe("123가4567");
    expect(normalizeCarNo("서울12가3456")).toBe("서울12가3456");
    expect(normalizeCarNo("3456")).toBeNull();
    expect(normalizeCarNo("12ga3456")).toBeNull();
  });
});

describe("checkParkingAttempt", () => {
  it("기록이 없으면 통과", () => {
    expect(checkParkingAttempt(base, [])).toEqual({ blocked: null, flags: [], newFlags: [] });
  });

  it("하루 한도는 OK·PENDING 만 센다", () => {
    const two = [row(), row({ status: "PENDING" })];
    expect(checkParkingAttempt(base, two).blocked).toMatch(/하루 2번/);
    expect(checkParkingAttempt(base, [row(), row({ status: "FAILED" }), row({ status: "BLOCKED" })]).blocked).toBeNull();
    // 다른 날·다른 학생은 세지 않는다
    expect(checkParkingAttempt(base, [row({ date: addDays(TODAY, -1) }), row({ studentId: "s2" })]).blocked).toBeNull();
  });

  it("같은 차량이 30일 중 15일 이상이면 정기 방문", () => {
    const days = Array.from({ length: PARKING_RULES.frequentCarDays - 1 }, (_, i) => row({ date: addDays(TODAY, -(i + 1)) }));
    expect(checkParkingAttempt(base, days).flags).toContain("FREQUENT_CAR");
    expect(checkParkingAttempt(base, days.slice(1)).flags).not.toContain("FREQUENT_CAR");
  });

  it("7일 동안 8회 이상", () => {
    const week = Array.from({ length: 7 }, (_, i) => row({ date: addDays(TODAY, -(i % 6) - 1) }));
    expect(checkParkingAttempt(base, week).flags).toContain("MANY_IN_WEEK");
    // 8일 전 기록은 주간에 넣지 않는다
    const old = week.map((r) => ({ ...r, date: addDays(TODAY, -8) }));
    expect(checkParkingAttempt(base, old).flags).not.toContain("MANY_IN_WEEK");
  });

  it("한 학부모가 차량 3대 이상", () => {
    const cars = [row({ carNo: "11나1111", date: addDays(TODAY, -3) }), row({ carNo: "22다2222", date: addDays(TODAY, -5) })];
    expect(checkParkingAttempt(base, cars).flags).toContain("MANY_CARS");
  });

  it("다른 가족이 쓴 차량 — 같은 학부모의 형제는 제외", () => {
    expect(checkParkingAttempt(base, [row({ studentId: "s2", authUserId: "p2", date: addDays(TODAY, -2) })]).flags).toContain("SHARED_CAR");
    expect(checkParkingAttempt(base, [row({ studentId: "s2", date: addDays(TODAY, -2) })]).flags).not.toContain("SHARED_CAR");
  });

  it("운영 시간 밖", () => {
    expect(checkParkingAttempt({ ...base, hour: 3 }, []).flags).toEqual(["OFF_HOURS"]);
    expect(checkParkingAttempt({ ...base, hour: 23 }, []).flags).toEqual([]);
  });

  it("이 가족 기록에 이미 있던 사유는 새 알림에서 뺀다", () => {
    const r = checkParkingAttempt({ ...base, hour: 3 }, [row({ date: addDays(TODAY, -1), flags: ["OFF_HOURS"] })]);
    expect(r.flags).toEqual(["OFF_HOURS"]);
    expect(r.newFlags).toEqual([]);
  });
});
