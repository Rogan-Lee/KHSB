import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/safety", () => ({ resolveContentReport: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { MobileApiError } from "@/lib/mobile-auth";
import { resolveContentReport } from "@/lib/safety";
import { resolveReport } from "@/actions/safety";
import { mockSession } from "./_helpers";

const input = { reportId: "r1", resolution: "WARNED" as const, note: "주의 조치" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveContentReport).mockResolvedValue({ ok: true });
});

describe("resolveReport", () => {
  it("throws Forbidden when there is no session", async () => {
    vi.mocked(auth).mockResolvedValue(null);

    await expect(resolveReport(input)).rejects.toThrow("Forbidden");
    expect(resolveContentReport).not.toHaveBeenCalled();
  });

  it.each(["HEAD_MENTOR", "MENTOR", "STAFF", "CONSULTANT", "MANAGER_MENTOR", "ADMIN", "STUDENT"] as const)(
    "throws Forbidden for %s",
    async (role) => {
      vi.mocked(auth).mockResolvedValue(mockSession({ role }));

      await expect(resolveReport(input)).rejects.toThrow("Forbidden");
      expect(resolveContentReport).not.toHaveBeenCalled();
    },
  );

  it.each(["DIRECTOR", "SUPER_ADMIN"] as const)("resolves as the signed-in %s", async (role) => {
    vi.mocked(auth).mockResolvedValue(mockSession({ id: "u1", name: "원장", role }));

    await expect(resolveReport(input)).resolves.toEqual({ ok: true });
    expect(resolveContentReport).toHaveBeenCalledWith({ id: "u1", name: "원장" }, input);
    expect(revalidatePath).toHaveBeenCalledWith("/moderation");
  });

  it("returns the Korean message of a MobileApiError instead of throwing", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession({ role: "DIRECTOR" }));
    vi.mocked(resolveContentReport).mockRejectedValue(new MobileApiError("이미 처리된 신고입니다", 409));

    await expect(resolveReport(input)).resolves.toEqual({ ok: false, error: "이미 처리된 신고입니다" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rethrows unexpected errors", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession({ role: "DIRECTOR" }));
    vi.mocked(resolveContentReport).mockRejectedValue(new Error("db down"));

    await expect(resolveReport(input)).rejects.toThrow("db down");
  });
});
