import { describe, expect, it } from "vitest";

import {
  isWinterGradeRequired,
  maskReservationName,
  resolveWinterGrade,
  winterGradeLabel,
} from "@/lib/waitlist-winter";

describe("isWinterGradeRequired", () => {
  it("asks only winter waitlist applicants who are not N수생", () => {
    expect(isWinterGradeRequired({ kind: "WAITLIST", entryPreference: "winter", gradeType: "ENROLLED" })).toBe(true);
    expect(isWinterGradeRequired({ kind: "WAITLIST", entryPreference: "winter", gradeType: null })).toBe(true);
    expect(isWinterGradeRequired({ kind: "WAITLIST", entryPreference: "winter", gradeType: "REPEAT" })).toBe(false);
    expect(isWinterGradeRequired({ kind: "WAITLIST", entryPreference: "immediate", gradeType: "ENROLLED" })).toBe(false);
    expect(isWinterGradeRequired({ kind: "WAITLIST", entryPreference: null, gradeType: "ENROLLED" })).toBe(false);
    expect(isWinterGradeRequired({ kind: "INQUIRY", entryPreference: "winter", gradeType: "ENROLLED" })).toBe(false);
  });
});

describe("resolveWinterGrade", () => {
  const winter = { kind: "WAITLIST", entryPreference: "winter", gradeType: "ENROLLED" } as const;

  it("requires an allowed grade for winter applicants", () => {
    expect(resolveWinterGrade({ ...winter, winterGrade: "pre_high2" })).toEqual({ ok: true, winterGrade: "pre_high2" });
    expect(resolveWinterGrade({ ...winter, winterGrade: null })).toEqual({
      ok: false,
      error: "윈터 시즌 예비 학년을 선택해주세요",
    });
    expect(resolveWinterGrade({ ...winter, winterGrade: "high4" }).ok).toBe(false);
  });

  it("drops a leftover grade when it no longer applies", () => {
    expect(resolveWinterGrade({ ...winter, entryPreference: "immediate", winterGrade: "pre_high1" })).toEqual({
      ok: true,
      winterGrade: null,
    });
    expect(resolveWinterGrade({ ...winter, gradeType: "REPEAT", winterGrade: "pre_high3" })).toEqual({
      ok: true,
      winterGrade: null,
    });
  });
});

describe("winterGradeLabel", () => {
  it("labels known values only", () => {
    expect(winterGradeLabel("pre_high1")).toBe("예비고1");
    expect(winterGradeLabel("unknown")).toBeNull();
    expect(winterGradeLabel(null)).toBeNull();
  });
});

describe("maskReservationName", () => {
  it("keeps only the surname", () => {
    expect(maskReservationName("정우혁")).toBe("정○○");
    expect(maskReservationName("  강민 ")).toBe("강○○");
  });

  it("skips names that are not Korean", () => {
    expect(maskReservationName("John")).toBeNull();
    expect(maskReservationName("")).toBeNull();
    expect(maskReservationName(null)).toBeNull();
  });
});
