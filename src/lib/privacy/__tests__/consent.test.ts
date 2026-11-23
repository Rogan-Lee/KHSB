import { describe, expect, it } from "vitest";
import { fullAge, parsePaperConsent, type PaperConsentInput } from "../consent";

const today = new Date("2026-11-22T00:00:00.000Z");
const base: PaperConsentInput = {
  studentId: "s1",
  agreedOn: "2026-11-20",
  under14: false,
  guardianName: "",
  guardianCheck: "",
  agreed: { PRIVACY_REQUIRED: true, MARKETING: false },
};
const parse = (over: Partial<PaperConsentInput>, birthDate: Date | null = null) =>
  parsePaperConsent({ ...base, ...over }, { today, birthDate });

describe("fullAge", () => {
  it("생일 전날까지는 한 살 적다", () => {
    const birth = new Date("2012-11-23T00:00:00.000Z");
    expect(fullAge(birth, new Date("2026-11-22T00:00:00.000Z"))).toBe(13);
    expect(fullAge(birth, new Date("2026-11-23T00:00:00.000Z"))).toBe(14);
  });
});

describe("parsePaperConsent", () => {
  it("14세 이상은 법정대리인 없이 등록된다", () => {
    const r = parse({});
    expect(r.ok && r.value.kinds).toEqual([
      { kind: "PRIVACY_REQUIRED", agreed: true },
      { kind: "MARKETING", agreed: false },
    ]);
  });

  it("14세 미만은 법정대리인 이름과 확인 방법이 모두 있어야 한다", () => {
    expect(parse({ under14: true })).toMatchObject({ ok: false });
    expect(parse({ under14: true, guardianName: "보호자" })).toMatchObject({ ok: false });
    expect(parse({ under14: true, guardianName: "보호자", guardianCheck: "PAPER_SIGN" })).toMatchObject({ ok: true });
    expect(parse({ under14: true, guardianName: "보호자", guardianCheck: "아무거나" })).toMatchObject({ ok: false });
  });

  it("생년월일이 있으면 화면에서 고른 값보다 우선한다", () => {
    const r = parse({ under14: false }, new Date("2013-01-01T00:00:00.000Z"));
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("법정대리인") });
  });

  it("미래 날짜와 필수 동의 누락을 막는다", () => {
    expect(parse({ agreedOn: "2026-11-23" })).toMatchObject({ ok: false });
    expect(parse({ agreedOn: "어제" })).toMatchObject({ ok: false });
    expect(parse({ agreed: { MARKETING: true } })).toMatchObject({ ok: false });
  });
});
