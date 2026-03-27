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

describe("getMentorings — role-based filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("MENTOR role only sees their own mentorings (mentorId filter applied)", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "mentor-1", role: "MENTOR", name: "김멘토" },
    });
    vi.mocked(prisma.mentoring.findMany).mockResolvedValue([]);

    await getMentorings();

    expect(prisma.mentoring.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { mentorId: "mentor-1" },
      })
    );
  });

  it("DIRECTOR role sees all mentorings (no mentorId filter)", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "director-1", role: "DIRECTOR", name: "원장" },
    });
    vi.mocked(prisma.mentoring.findMany).mockResolvedValue([]);

    await getMentorings();

    const call = vi.mocked(prisma.mentoring.findMany).mock.calls[0][0];
    // where should be undefined (no filter), not restricted to a specific mentor
    expect(call.where).toBeUndefined();
  });

  it("throws Unauthorized when not logged in", async () => {
    vi.mocked(auth).mockResolvedValue(null);

    await expect(getMentorings()).rejects.toThrow("Unauthorized");
  });
});
