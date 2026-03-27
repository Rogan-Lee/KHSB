import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    student: { create: vi.fn() },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { auth } from "@/lib/auth";
import { createStudent } from "@/actions/students";

const mockSession = { user: { id: "user-1", role: "DIRECTOR", name: "원장" } };

describe("createStudent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession);
  });

  it("throws ZodError when required field 'name' is missing", async () => {
    const fd = new FormData();
    // name is missing
    fd.set("parentPhone", "010-0000-0000");
    fd.set("grade", "고1");
    fd.set("startDate", "2026-03-01");

    await expect(createStudent(fd)).rejects.toThrow();
  });

  it("throws ZodError when required field 'parentPhone' is missing", async () => {
    const fd = new FormData();
    fd.set("name", "홍길동");
    // parentPhone is missing
    fd.set("grade", "고1");
    fd.set("startDate", "2026-03-01");

    await expect(createStudent(fd)).rejects.toThrow();
  });

  it("throws ZodError when required field 'startDate' is missing", async () => {
    const fd = new FormData();
    fd.set("name", "홍길동");
    fd.set("parentPhone", "010-0000-0000");
    fd.set("grade", "고1");
    // startDate is missing

    await expect(createStudent(fd)).rejects.toThrow();
  });
});
