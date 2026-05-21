import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    parentReport: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    },
  },
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
  headers: () => ({ get: () => null }),
}));

import { prisma } from "@/lib/prisma";
import { getParentReport } from "@/actions/parent-reports";

describe("getParentReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null for an invalid/unknown token (shows 404 page)", async () => {
    vi.mocked(prisma.parentReport.findUnique).mockResolvedValue(null);

    const result = await getParentReport("invalid-token-xyz");

    expect(result).toBeNull();
    expect(prisma.parentReport.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { token: "invalid-token-xyz" } })
    );
  });

  it("returns null for a revoked token", async () => {
    vi.mocked(prisma.parentReport.findUnique).mockResolvedValue({
      id: "r1",
      token: "valid-token-123",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      revokedAt: new Date(),
      student: { id: "s1", name: "홍길동", grade: "고1", school: "테스트고", parentPhone: "01012345678" },
      mentoring: null,
    } as never);

    const result = await getParentReport("valid-token-123");
    expect(result).toBeNull();
  });

  it("returns null for an expired token", async () => {
    vi.mocked(prisma.parentReport.findUnique).mockResolvedValue({
      id: "r1",
      token: "valid-token-123",
      expiresAt: new Date(Date.now() - 1000),
      revokedAt: null,
      student: { id: "s1", name: "홍길동", grade: "고1", school: "테스트고", parentPhone: "01012345678" },
      mentoring: null,
    } as never);

    const result = await getParentReport("valid-token-123");
    expect(result).toBeNull();
  });

  it("returns the report for a valid (not expired, not revoked) token", async () => {
    vi.mocked(prisma.parentReport.findUnique).mockResolvedValue({
      id: "r1",
      token: "valid-token-123",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      revokedAt: null,
      student: { id: "s1", name: "홍길동", grade: "고1", school: "테스트고", parentPhone: "01012345678" },
      mentoring: null,
    } as never);

    const result = await getParentReport("valid-token-123");

    expect(result).not.toBeNull();
    expect(result?.token).toBe("valid-token-123");
  });
});
