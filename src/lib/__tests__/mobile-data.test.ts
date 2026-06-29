import { describe, expect, it } from "vitest";

import {
  getKstDayContext,
  isAttendanceLate,
  resolveAttendanceStatus,
} from "@/lib/mobile-data";

describe("getKstDayContext", () => {
  it("uses the Asia/Seoul calendar day around UTC midnight", () => {
    const context = getKstDayContext(new Date("2026-06-19T16:30:00.000Z"));

    expect(context.dateKey).toBe("2026-06-20");
    expect(context.dayOfWeek).toBe(6);
    expect(context.nowTime).toBe("01:30");
    expect(context.start.toISOString()).toBe("2026-06-19T15:00:00.000Z");
    expect(context.end.toISOString()).toBe("2026-06-20T15:00:00.000Z");
  });
});

describe("resolveAttendanceStatus", () => {
  const base = {
    checkIn: null,
    checkOut: null,
    outEnd: null,
    outStart: null,
    type: "NORMAL" as const,
  };

  it("distinguishes absent, present, away, and checked-out students", () => {
    expect(resolveAttendanceStatus()).toBe("미입실");
    expect(resolveAttendanceStatus({ ...base, type: "ABSENT" })).toBe("결석");
    expect(
      resolveAttendanceStatus({
        ...base,
        checkIn: new Date("2026-06-20T00:00:00.000Z"),
      }),
    ).toBe("입실");
    expect(
      resolveAttendanceStatus({
        ...base,
        checkIn: new Date("2026-06-20T00:00:00.000Z"),
        outStart: new Date("2026-06-20T03:00:00.000Z"),
      }),
    ).toBe("외출");
    expect(
      resolveAttendanceStatus({
        ...base,
        checkIn: new Date("2026-06-20T00:00:00.000Z"),
        checkOut: new Date("2026-06-20T12:00:00.000Z"),
      }),
    ).toBe("퇴실");
  });
});

describe("isAttendanceLate", () => {
  it("does not wrap a late-night schedule into the start of the same day", () => {
    expect(isAttendanceLate("미입실", "23:45", "00:30")).toBe(false);
    expect(isAttendanceLate("미입실", "09:00", "09:29")).toBe(false);
    expect(isAttendanceLate("미입실", "09:00", "09:30")).toBe(true);
    expect(isAttendanceLate("입실", "09:00", "10:00")).toBe(false);
  });
});
