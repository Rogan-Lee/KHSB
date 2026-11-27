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
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
  headers: () => ({ get: () => null }),
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getParentReport, updateParentReportNote } from "@/actions/parent-reports";
import { mockSession } from "./_helpers";

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

describe("updateParentReportNote — AI 출처 칸", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession({ role: "DIRECTOR" }) as never);
  });

  const savedData = () => vi.mocked(prisma.parentReport.update).mock.calls[0][0].data;

  it("직접 쓴 글은 false", async () => {
    await updateParentReportNote("r1", "이번 주도 수고했어요.");
    expect(savedData()).toEqual({ customNote: "이번 주도 수고했어요.", customNoteAi: false });
  });

  it("AI 고도화 초안에서 시작한 글은 고쳐 저장해도 true", async () => {
    await updateParentReportNote("r1", "[오늘 멘토링 내용]\n고친 내용", true);
    expect(savedData()).toEqual({ customNote: "[오늘 멘토링 내용]\n고친 내용", customNoteAi: true });
  });

  it("글을 비우면 false", async () => {
    await updateParentReportNote("r1", "", true);
    expect(savedData()).toEqual({ customNote: null, customNoteAi: false });
  });
});
