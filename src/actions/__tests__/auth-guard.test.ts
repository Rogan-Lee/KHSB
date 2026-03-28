import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Clerk and Prisma before importing the action
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    student: { create: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { auth } from "@/lib/auth";
import { createStudent } from "@/actions/students";

describe("auth guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws Unauthorized when auth() returns null", async () => {
    vi.mocked(auth).mockResolvedValue(null);

    const formData = new FormData();
    formData.set("name", "홍길동");
    formData.set("parentPhone", "010-0000-0000");
    formData.set("grade", "고1");
    formData.set("startDate", "2026-03-01");

    await expect(createStudent(formData)).rejects.toThrow("Unauthorized");
  });

  it("does NOT throw when auth() returns a valid session", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", role: "DIRECTOR", name: "원장" },
    });

    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.student.create).mockResolvedValue({} as never);

    const formData = new FormData();
    formData.set("name", "홍길동");
    formData.set("parentPhone", "010-0000-0000");
    formData.set("grade", "고1");
    formData.set("startDate", "2026-03-01");

    // Should not throw (may call redirect after create — that's fine)
    await expect(createStudent(formData)).resolves.not.toThrow();
  });
});
