import { describe, it, expect } from "vitest";
import { normalizeMobile, phonesMatch } from "@/lib/phone";

describe("normalizeMobile", () => {
  it("하이픈 있는 휴대폰을 숫자열로", () => {
    expect(normalizeMobile("010-1234-5678")).toBe("01012345678");
  });
  it("잘못된 형식은 null", () => {
    expect(normalizeMobile("02-123-4567")).toBeNull(); // 유선
    expect(normalizeMobile("0101234")).toBeNull(); // 너무 짧음
    expect(normalizeMobile("")).toBeNull();
  });
});

describe("phonesMatch", () => {
  it("저장 형식이 달라도 같은 번호면 일치", () => {
    expect(phonesMatch("010-1234-5678", "01012345678")).toBe(true);
  });
  it("다른 번호는 불일치", () => {
    expect(phonesMatch("01011112222", "01033334444")).toBe(false);
  });
  it("빈 값끼리는 불일치 (매칭 폭주 방지)", () => {
    expect(phonesMatch(null, null)).toBe(false);
    expect(phonesMatch("", "")).toBe(false);
  });
});
