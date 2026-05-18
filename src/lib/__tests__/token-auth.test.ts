import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tokenGateAttempt: { count: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
  headers: vi.fn(),
}));

import {
  REPORT_TOKEN_VALID_DAYS,
  VOCAB_TOKEN_VALID_DAYS,
  birthDateToYYMMDD,
  checkExpiry,
  hashToken,
  normalizeDigits,
  phoneLast4,
  reportExpiresAt,
  safeEqual,
  vocabExpiresAt,
} from "@/lib/token-auth";

describe("checkExpiry", () => {
  const now = new Date("2026-05-13T00:00:00.000Z");

  it("returns 'revoked' when revokedAt is set, even with valid expiresAt", () => {
    expect(
      checkExpiry(
        {
          expiresAt: new Date("2099-01-01T00:00:00.000Z"),
          revokedAt: new Date("2026-05-01T00:00:00.000Z"),
        },
        now
      )
    ).toBe("revoked");
  });

  it("returns null when expiresAt is null (legacy row — must not invalidate live links)", () => {
    expect(checkExpiry({ expiresAt: null, revokedAt: null }, now)).toBeNull();
  });

  it("returns 'revoked' when expiresAt is null but revokedAt is set", () => {
    expect(
      checkExpiry(
        { expiresAt: null, revokedAt: new Date("2026-05-01T00:00:00.000Z") },
        now
      )
    ).toBe("revoked");
  });

  it("returns 'expired' when expiresAt is in the past", () => {
    expect(
      checkExpiry({ expiresAt: new Date("2026-05-12T23:59:59.000Z"), revokedAt: null }, now)
    ).toBe("expired");
  });

  it("returns null when expiresAt is in the future and not revoked", () => {
    expect(
      checkExpiry({ expiresAt: new Date("2026-06-01T00:00:00.000Z"), revokedAt: null }, now)
    ).toBeNull();
  });
});

describe("reportExpiresAt / vocabExpiresAt", () => {
  it("reports expire 30 days from base", () => {
    const base = new Date("2026-05-13T00:00:00.000Z");
    const expected = new Date(base);
    expected.setDate(expected.getDate() + REPORT_TOKEN_VALID_DAYS);
    expect(reportExpiresAt(base).toISOString()).toBe(expected.toISOString());
  });

  it("vocab attempts expire 14 days from base", () => {
    const base = new Date("2026-05-13T00:00:00.000Z");
    const expected = new Date(base);
    expected.setDate(expected.getDate() + VOCAB_TOKEN_VALID_DAYS);
    expect(vocabExpiresAt(base).toISOString()).toBe(expected.toISOString());
  });
});

describe("birthDateToYYMMDD", () => {
  it("formats two-digit year/month/day", () => {
    expect(birthDateToYYMMDD(new Date(Date.UTC(2004, 2, 15)))).toBe("040315");
  });
  it("handles century rollover (2010 → '10')", () => {
    expect(birthDateToYYMMDD(new Date(Date.UTC(2010, 0, 1)))).toBe("100101");
  });
});

describe("normalizeDigits / phoneLast4", () => {
  it("strips non-digits", () => {
    expect(normalizeDigits("010-1234-5678")).toBe("01012345678");
  });
  it("extracts last 4 digits from formatted phone", () => {
    expect(phoneLast4("010-1234-5678")).toBe("5678");
  });
  it("returns null for short input", () => {
    expect(phoneLast4("12")).toBeNull();
    expect(phoneLast4(null)).toBeNull();
  });
});

describe("hashToken", () => {
  it("produces deterministic hex digest", () => {
    const a = hashToken("abc");
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken("abc")).toBe(a);
  });
  it("different tokens produce different hashes", () => {
    expect(hashToken("abc")).not.toBe(hashToken("def"));
  });
});

describe("safeEqual", () => {
  it("returns true for identical strings", () => {
    expect(safeEqual("0000", "0000")).toBe(true);
  });
  it("returns false for different strings of same length", () => {
    expect(safeEqual("1234", "5678")).toBe(false);
  });
  it("returns false for different-length strings", () => {
    expect(safeEqual("12", "1234")).toBe(false);
  });
});
