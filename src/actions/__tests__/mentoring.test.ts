import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    mentoring: { findMany: vi.fn() },
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMentorings } from "@/actions/mentoring";
import { mockSession } from "./_helpers";

describe("getMentorings — role-based filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("MENTOR role only sees their own mentorings (mentorId filter applied)", async () => {
    vi.mocked(auth).mockResolvedValue(
      mockSession({ id: "mentor-1", role: "MENTOR", name: "김멘토" })
    );
    vi.mocked(prisma.mentoring.findMany).mockResolvedValue([]);

    await getMentorings();

    expect(prisma.mentoring.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // 기본 호출은 CANCELLED 자동 제외 + 본인 mentorId
        where: { mentorId: "mentor-1", status: { not: "CANCELLED" } },
      })
    );
  });

  it("DIRECTOR role sees all mentorings (no mentorId filter, CANCELLED 기본 숨김)", async () => {
    vi.mocked(auth).mockResolvedValue(
      mockSession({ id: "director-1", role: "DIRECTOR", name: "원장" })
    );
    vi.mocked(prisma.mentoring.findMany).mockResolvedValue([]);

    await getMentorings();

    const call = vi.mocked(prisma.mentoring.findMany).mock.calls[0]![0]!;
    // mentorId 필터는 없지만 status CANCELLED 제외는 기본 적용
    expect(call?.where).toEqual({ status: { not: "CANCELLED" } });
  });

  it("includeCanceled=true 면 CANCELLED 까지 포함하고 where 가 빈 객체", async () => {
    vi.mocked(auth).mockResolvedValue(
      mockSession({ id: "director-1", role: "DIRECTOR", name: "원장" })
    );
    vi.mocked(prisma.mentoring.findMany).mockResolvedValue([]);

    await getMentorings(undefined, { includeCanceled: true });

    const call = vi.mocked(prisma.mentoring.findMany).mock.calls[0]![0]!;
    expect(call.where).toEqual({});
  });

  it("throws Unauthorized when not logged in", async () => {
    vi.mocked(auth).mockResolvedValue(null);

    await expect(getMentorings()).rejects.toThrow("Unauthorized");
  });
});
