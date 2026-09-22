import { describe, expect, it } from "vitest";
import { promoteGrade } from "../grade-promotion";

describe("promoteGrade", () => {
  it("중학교 학년을 승급한다", () => {
    expect(promoteGrade("중1")).toEqual({ after: "중2", action: "change" });
    expect(promoteGrade("중2")).toEqual({ after: "중3", action: "change" });
    expect(promoteGrade("중3")).toEqual({ after: "예비고1", action: "change" });
  });

  it("고등학교 학년을 승급한다", () => {
    expect(promoteGrade("예비고1")).toEqual({ after: "고1", action: "change" });
    expect(promoteGrade("고1")).toEqual({ after: "고2", action: "change" });
    expect(promoteGrade("고2")).toEqual({ after: "고3", action: "change" });
  });

  it("고3 은 퇴원예정으로 표기한다", () => {
    expect(promoteGrade("고3")).toEqual({ after: "고3(퇴원예정)", action: "change" });
  });

  it("N수/재수 포함 문자열은 유지한다", () => {
    expect(promoteGrade("N수")).toEqual({ after: "N수", action: "keep" });
    expect(promoteGrade("재수")).toEqual({ after: "재수", action: "keep" });
    expect(promoteGrade("N수(반수)")).toEqual({ after: "N수(반수)", action: "keep" });
  });

  it("매핑 불가 값은 수동 확인으로 분류한다", () => {
    expect(promoteGrade("기타")).toEqual({ after: "기타", action: "manual" });
    expect(promoteGrade("고3(퇴원예정)")).toEqual({ after: "고3(퇴원예정)", action: "manual" });
    expect(promoteGrade("")).toEqual({ after: "", action: "manual" });
  });

  it("앞뒤 공백은 무시한다", () => {
    expect(promoteGrade(" 고1 ")).toEqual({ after: "고2", action: "change" });
  });
});
