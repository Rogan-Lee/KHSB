import { describe, expect, it } from "vitest";

import { currentPeriodNo, isVacationDay, periodsFor, staffDayStart } from "@/lib/class-periods";

describe("교시표", () => {
  it("학기 중 평일은 16시 8교시, 주말·윈터스쿨은 09시 9교시", () => {
    expect(isVacationDay("2026-11-13")).toBe(false); // 금
    expect(isVacationDay("2026-11-14")).toBe(true); // 토
    expect(isVacationDay("2027-01-04")).toBe(true); // 윈터스쿨 월
    expect(isVacationDay("2027-03-02")).toBe(false);
    expect(periodsFor("2026-11-13")).toHaveLength(8);
    expect(periodsFor("2027-01-04")).toHaveLength(9);
    expect(staffDayStart("2026-11-13")).toBe("16:00");
    expect(staffDayStart("2027-01-04")).toBe("09:00");
  });

  it("지금 교시 = 시작한 교시 중 마지막, 첫 교시 전은 0(입실)", () => {
    expect(currentPeriodNo("2026-11-13", "15:59")).toBe(0);
    expect(currentPeriodNo("2026-11-13", "16:00")).toBe(1);
    expect(currentPeriodNo("2026-11-13", "16:55")).toBe(1); // 쉬는 시간은 직전 교시
    expect(currentPeriodNo("2026-11-13", "23:30")).toBe(8);
    expect(currentPeriodNo("2027-01-04", "12:30")).toBe(2); // 점심
    expect(currentPeriodNo("2027-01-04", "19:20")).toBe(6);
    expect(currentPeriodNo("2027-01-04", "23:05")).toBe(8); // 8교시 뒤 쉬는 시간
    expect(currentPeriodNo("2027-01-04", "23:10")).toBe(9);
  });
});
