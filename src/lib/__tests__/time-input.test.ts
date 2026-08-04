import { describe, it, expect } from "vitest";
import { parseTimeText, clampToMinHour } from "@/lib/time-input";

describe("parseTimeText", () => {
  it("빈 값은 지우기로 허용", () => {
    expect(parseTimeText("")).toBe("");
    expect(parseTimeText("  ")).toBe("");
  });

  it("숫자만 입력", () => {
    expect(parseTimeText("9")).toBe("09:00");
    expect(parseTimeText("14")).toBe("14:00");
    expect(parseTimeText("930")).toBe("09:30");
    expect(parseTimeText("0930")).toBe("09:30");
    expect(parseTimeText("1430")).toBe("14:30");
    expect(parseTimeText("123")).toBe("01:23");
  });

  it("콜론 포함 입력", () => {
    expect(parseTimeText("9:5")).toBe("09:05");
    expect(parseTimeText("9:30")).toBe("09:30");
    expect(parseTimeText("14:30")).toBe("14:30");
  });

  it("범위 초과/해석 불가는 null", () => {
    expect(parseTimeText("24:00")).toBeNull();
    expect(parseTimeText("12:60")).toBeNull();
    expect(parseTimeText("2500")).toBeNull();
    expect(parseTimeText("abc")).toBeNull();
    expect(parseTimeText("12345")).toBeNull();
    expect(parseTimeText("1:2:3")).toBeNull();
  });
});

describe("clampToMinHour", () => {
  it("minHour 미만이면 시만 끌어올림", () => {
    expect(clampToMinHour("05:30", 7)).toBe("07:30");
    expect(clampToMinHour("07:00", 7)).toBe("07:00");
    expect(clampToMinHour("14:30", 7)).toBe("14:30");
  });

  it("minHour 없으면 그대로", () => {
    expect(clampToMinHour("05:30")).toBe("05:30");
    expect(clampToMinHour("", 7)).toBe("");
  });
});
