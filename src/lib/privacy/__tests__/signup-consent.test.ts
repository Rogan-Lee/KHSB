import { describe, expect, it } from "vitest";
import {
  formatSignupConsentHeader,
  missingSignupConsent,
  parseSignupConsentHeader,
  signupConsentItems,
  type SignupConsentKey,
} from "../signup-consent";
import { signupConsentRows, signupUnder14 } from "../signup-consent-server";

const keys = (audience: "STUDENT" | "PARENT" | "STAFF", under14 = false) =>
  signupConsentItems(audience, { under14 }).map((item) => item.key);
const set = (...k: SignupConsentKey[]) => new Set<SignupConsentKey>(k);

describe("parseSignupConsentHeader", () => {
  it("헤더가 없으면 null (옛 앱)", () => {
    expect(parseSignupConsentHeader(null)).toBeNull();
    expect(parseSignupConsentHeader(undefined)).toBeNull();
  });
  it("빈 값은 빈 집합", () => {
    expect(parseSignupConsentHeader("")).toEqual(new Set());
  });
  it("모르는 key 는 버리고 공백은 무시", () => {
    expect(parseSignupConsentHeader(" TERMS , FOO,MARKETING,")).toEqual(set("TERMS", "MARKETING"));
  });
  it("format 과 왕복", () => {
    expect(parseSignupConsentHeader(formatSignupConsentHeader(["TERMS", "PRIVACY"]))).toEqual(set("TERMS", "PRIVACY"));
  });
});

describe("signupConsentItems", () => {
  it("대상별 항목", () => {
    expect(keys("STAFF")).toEqual(["TERMS", "PRIVACY"]);
    expect(keys("PARENT")).toEqual(["TERMS", "PRIVACY", "MARKETING"]);
    expect(keys("STUDENT")).toEqual(["TERMS", "PRIVACY", "MARKETING"]);
    expect(keys("STUDENT", true)).toEqual(["TERMS", "PRIVACY", "GUARDIAN", "MARKETING"]);
    // 학부모는 under14 를 넘겨도 보호자 항목이 없다
    expect(keys("PARENT", true)).toEqual(["TERMS", "PRIVACY", "MARKETING"]);
  });
});

describe("missingSignupConsent", () => {
  const student14 = signupConsentItems("STUDENT", { under14: true });
  it("필수가 빠지면 첫 항목 문구", () => {
    expect(missingSignupConsent(set(), student14)).toBe("필수 항목(이용약관·운영정책 동의)을 확인해 주세요");
    expect(missingSignupConsent(set("TERMS", "PRIVACY"), student14)).toBe(
      "필수 항목(만 14세 미만 보호자 동의 확인)을 확인해 주세요",
    );
  });
  it("선택(광고)은 없어도 통과", () => {
    expect(missingSignupConsent(set("TERMS", "PRIVACY", "GUARDIAN"), student14)).toBeNull();
  });
});

describe("signupConsentRows", () => {
  it("헤더 없음 → 이용약관 한 줄", () => {
    expect(signupConsentRows(null, "STUDENT", true)).toEqual([{ kind: "TERMS", agreed: true, under14: null }]);
  });
  it("만 14세 미만 학생, 광고 안 함 → TERMS·PRIVACY_REQUIRED(under14)·MARKETING false, 보호자 행 없음", () => {
    expect(signupConsentRows(set("TERMS", "PRIVACY", "GUARDIAN"), "STUDENT", true)).toEqual([
      { kind: "TERMS", agreed: true, under14: null },
      { kind: "PRIVACY_REQUIRED", agreed: true, under14: true },
      { kind: "MARKETING", agreed: false, under14: null },
    ]);
  });
  it("학부모 광고 동의 → MARKETING true, under14 는 비움", () => {
    expect(signupConsentRows(set("TERMS", "PRIVACY", "MARKETING"), "PARENT", false)).toEqual([
      { kind: "TERMS", agreed: true, under14: null },
      { kind: "PRIVACY_REQUIRED", agreed: true, under14: null },
      { kind: "MARKETING", agreed: true, under14: null },
    ]);
  });
  it("직원은 광고 행이 없다", () => {
    expect(signupConsentRows(set("TERMS", "PRIVACY"), "STAFF", false).map((r) => r.kind)).toEqual([
      "TERMS",
      "PRIVACY_REQUIRED",
    ]);
  });
});

describe("signupUnder14", () => {
  const today = new Date("2026-11-24T00:00:00.000Z");
  const birth = (d: string) => new Date(`${d}T00:00:00.000Z`);
  it("생년월일이 있으면 만 나이 (학년보다 우선)", () => {
    expect(signupUnder14("STUDENT", { birthDate: birth("2012-11-25"), grade: "고1" }, today)).toBe(true);
    expect(signupUnder14("STUDENT", { birthDate: birth("2012-11-24"), grade: "중1" }, today)).toBe(false);
  });
  it("생년월일이 없으면 초등·중1·중2", () => {
    const by = (grade: string) => signupUnder14("STUDENT", { birthDate: null, grade }, today);
    expect(by("초6")).toBe(true);
    expect(by("중1")).toBe(true);
    expect(by("중2")).toBe(true);
    expect(by("중3")).toBe(false);
    expect(by("고1")).toBe(false);
    expect(by("N수")).toBe(false);
  });
  it("학생 초대가 아니면 false", () => {
    expect(signupUnder14("PARENT", { birthDate: null, grade: "중1" }, today)).toBe(false);
    expect(signupUnder14("STAFF", null, today)).toBe(false);
    expect(signupUnder14("STUDENT", null, today)).toBe(false);
  });
});
