import { describe, expect, it } from "vitest";
import { matchesSearch } from "@/lib/utils";

describe("matchesSearch", () => {
  it("빈 검색어는 전부 통과", () => expect(matchesSearch("  ", "김철수")).toBe(true));
  it("띄어쓰기·대소문자 무시", () => {
    expect(matchesSearch("김 철", "김철수")).toBe(true);
    expect(matchesSearch("abc", null, "xABCx")).toBe(true);
  });
  it("숫자 필드(좌석)도 비교", () => expect(matchesSearch("12", 12)).toBe(true));
  it("어느 필드에도 없으면 false", () => expect(matchesSearch("박", "김철수", undefined)).toBe(false));
});
