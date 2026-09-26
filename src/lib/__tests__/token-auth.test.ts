import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tokenGateAttempt: { count: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
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
  reserveGateAttempt,
  safeEqual,
  vocabExpiresAt,
} from "@/lib/token-auth";
import { prisma } from "@/lib/prisma";

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

describe("reserveGateAttempt (insert-then-count)", () => {
  const mocked = prisma.tokenGateAttempt as unknown as {
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };

  function setCounts(byToken: number, byTokenDaily: number, byIp: number) {
    mocked.count.mockReset();
    mocked.count
      .mockResolvedValueOnce(byToken)
      .mockResolvedValueOnce(byTokenDaily)
      .mockResolvedValueOnce(byIp);
  }

  it("records the attempt before counting and lets it through under the limit", async () => {
    vi.clearAllMocks();
    mocked.create.mockResolvedValue({ id: "a1" });
    mocked.deleteMany.mockResolvedValue({ count: 1 });
    setCounts(5, 5, 5); // 자기 행 포함 5 → 이전 실패 4회
    const r = await reserveGateAttempt("PARENT", "tok", "1.2.3.4", null);
    expect(r).toEqual({ locked: false, attemptId: "a1" });
    expect(mocked.create).toHaveBeenCalledTimes(1);
    expect(mocked.create.mock.invocationCallOrder[0]).toBeLessThan(
      mocked.count.mock.invocationCallOrder[0],
    );
    expect(mocked.deleteMany).not.toHaveBeenCalled();
  });

  it("locks and removes its own row once 5 prior failures exist in the window", async () => {
    vi.clearAllMocks();
    mocked.create.mockResolvedValue({ id: "a2" });
    mocked.deleteMany.mockResolvedValue({ count: 1 });
    setCounts(6, 6, 1);
    const r = await reserveGateAttempt("PARENT", "tok", "1.2.3.4", null);
    expect(r).toEqual({ locked: true, long: false });
    expect(mocked.deleteMany).toHaveBeenCalledWith({ where: { id: "a2" } });
  });

  it("locks on the 24h per-token cap even when the 10-minute window is clear", async () => {
    vi.clearAllMocks();
    mocked.create.mockResolvedValue({ id: "a3" });
    mocked.deleteMany.mockResolvedValue({ count: 1 });
    setCounts(1, 21, 1);
    const r = await reserveGateAttempt("STAFF", "tok", null, null);
    expect(r).toEqual({ locked: true, long: true });
  });

  it("locks when the same IP already failed 5 times across tokens", async () => {
    vi.clearAllMocks();
    mocked.create.mockResolvedValue({ id: "a4" });
    mocked.deleteMany.mockResolvedValue({ count: 1 });
    setCounts(1, 1, 6);
    const r = await reserveGateAttempt("PARENT", "other", "1.2.3.4", null);
    expect(r).toEqual({ locked: true, long: false });
  });
});
