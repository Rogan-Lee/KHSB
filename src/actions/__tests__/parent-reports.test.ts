import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    parentReport: { findUnique: vi.fn() },
  },
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

  it("returns the report for a valid token", async () => {
    const mockReport = {
      token: "valid-token-123",
      student: { id: "s1", name: "홍길동", grade: "고1", school: "테스트고" },
      mentoring: null,
    };
    vi.mocked(prisma.parentReport.findUnique).mockResolvedValue(mockReport as never);

    const result = await getParentReport("valid-token-123");

    expect(result).not.toBeNull();
    expect(result?.token).toBe("valid-token-123");
  });
});
