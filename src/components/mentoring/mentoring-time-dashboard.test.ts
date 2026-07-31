import { describe, it, expect } from "vitest";
import { durationMinutes } from "./mentoring-time-dashboard";

describe("durationMinutes", () => {
  it("computes minutes between two HH:MM times", () => {
    expect(durationMinutes("14:05", "15:10")).toBe(65);
    expect(durationMinutes("09:00", "09:12")).toBe(12);
  });
  it("returns null when either time is missing", () => {
    expect(durationMinutes(null, "15:00")).toBeNull();
    expect(durationMinutes("14:00", null)).toBeNull();
  });
  it("returns null for malformed or non-positive durations", () => {
    expect(durationMinutes("bad", "15:00")).toBeNull();
    expect(durationMinutes("25:00", "26:00")).toBeNull();
    expect(durationMinutes("15:00", "14:00")).toBeNull(); // end before start
    expect(durationMinutes("14:00", "14:00")).toBeNull(); // zero-length
  });
});
