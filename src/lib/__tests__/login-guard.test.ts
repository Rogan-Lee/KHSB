import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tokenGateAttempt: { count: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  },
}));

import {
  LOGIN_MAX_FAILURES,
  clientIpFrom,
  completeLoginAttempt,
  isGuardedSignInPath,
  loginIdentifier,
  reserveLoginAttempt,
} from "@/lib/login-guard";
import { prisma } from "@/lib/prisma";

const mocked = prisma.tokenGateAttempt as unknown as {
  count: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked.create.mockResolvedValue({ id: "a1" });
  mocked.deleteMany.mockResolvedValue({ count: 1 });
});

describe("loginIdentifier", () => {
  it("normalizes username and email the way better-auth compares them", () => {
    expect(loginIdentifier("/sign-in/username", { username: "  Mentor.Kim " })).toBe("mentor.kim");
    expect(loginIdentifier("/sign-in/email", { email: "Parent@Example.com" })).toBe("parent@example.com");
  });

  it("returns null for missing or non-string input", () => {
    expect(loginIdentifier("/sign-in/username", {})).toBeNull();
    expect(loginIdentifier("/sign-in/username", { username: 123 })).toBeNull();
    expect(loginIdentifier("/sign-in/email", { email: "   " })).toBeNull();
    expect(loginIdentifier("/sign-in/email", null)).toBeNull();
  });
});

describe("isGuardedSignInPath", () => {
  it("guards only password sign-in endpoints", () => {
    expect(isGuardedSignInPath("/sign-in/username")).toBe(true);
    expect(isGuardedSignInPath("/sign-in/email")).toBe(true);
    expect(isGuardedSignInPath("/sign-up/email")).toBe(false);
    expect(isGuardedSignInPath("/get-session")).toBe(false);
  });
});

describe("reserveLoginAttempt (insert-then-count)", () => {
  it("records the attempt before counting and lets it through under the limit", async () => {
    mocked.count.mockResolvedValue(LOGIN_MAX_FAILURES); // 자기 행 포함 10 → 이전 실패 9회
    const r = await reserveLoginAttempt("mentor.kim", "1.2.3.4");
    expect(r).toEqual({ locked: false, attemptId: "a1" });
    expect(mocked.create.mock.invocationCallOrder[0]).toBeLessThan(
      mocked.count.mock.invocationCallOrder[0],
    );
    const data = mocked.create.mock.calls[0][0].data;
    expect(data.scope).toBe("LOGIN");
    expect(data.tokenHash).not.toContain("mentor.kim"); // 아이디 원문 저장 금지
    expect(mocked.deleteMany).not.toHaveBeenCalled();
  });

  it("locks and removes its own row once the per-account limit is reached", async () => {
    mocked.count.mockResolvedValue(LOGIN_MAX_FAILURES + 1);
    const r = await reserveLoginAttempt("mentor.kim", null);
    expect(r).toEqual({ locked: true });
    expect(mocked.deleteMany).toHaveBeenCalledWith({ where: { id: "a1" } });
  });

  it("hashes the same identifier the same way regardless of IP", async () => {
    mocked.count.mockResolvedValue(1);
    await reserveLoginAttempt("mentor.kim", "1.1.1.1");
    await reserveLoginAttempt("mentor.kim", "2.2.2.2");
    const [a, b] = mocked.create.mock.calls.map((c) => c[0].data.tokenHash);
    expect(a).toBe(b);
  });
});

describe("completeLoginAttempt", () => {
  it("clears the account's failure rows on success", async () => {
    await completeLoginAttempt("mentor.kim", true);
    expect(mocked.deleteMany).toHaveBeenCalledTimes(1);
    expect(mocked.deleteMany.mock.calls[0][0].where.scope).toBe("LOGIN");
  });

  it("keeps the reserved row as a failure record on failure", async () => {
    await completeLoginAttempt("mentor.kim", false);
    expect(mocked.deleteMany).not.toHaveBeenCalled();
  });
});

describe("clientIpFrom", () => {
  it("uses the first x-forwarded-for value", () => {
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
    expect(clientIpFrom(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIpFrom(new Headers())).toBeNull();
    expect(clientIpFrom(undefined)).toBeNull();
  });
});
