import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getAuthIdentity: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { parentLink: { count: vi.fn() } },
}));

import { getAuthIdentity } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  MobileApiError,
  requireMobileAccount,
  requireMobileStaff,
  requireMobileStudent,
} from "@/lib/mobile-auth";

const request = new Request("http://localhost/api/mobile/v1/test") as never;

describe("mobile auth guards", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("allows an active student identity", async () => {
    vi.mocked(getAuthIdentity).mockResolvedValue({
      identity: {
        appUser: null,
        student: { id: "student-1", status: "ACTIVE" },
      },
    } as never);

    await expect(requireMobileStudent(request)).resolves.toMatchObject({
      id: "student-1",
    });
  });

  it("returns the auth user ID for any active mobile account", async () => {
    vi.mocked(getAuthIdentity).mockResolvedValue({
      identity: {
        appUser: null,
        id: "auth-1",
        student: { id: "student-1", status: "ACTIVE" },
      },
    } as never);

    await expect(requireMobileAccount(request)).resolves.toMatchObject({
      authUserId: "auth-1",
      student: { id: "student-1" },
    });
  });

  it("allows a parent account (ParentLink only) and rejects orphan accounts", async () => {
    vi.mocked(getAuthIdentity).mockResolvedValue({
      identity: { appUser: null, id: "auth-parent", student: null },
    } as never);

    vi.mocked(prisma.parentLink.count).mockResolvedValueOnce(1);
    await expect(requireMobileAccount(request)).resolves.toMatchObject({
      appUser: null,
      authUserId: "auth-parent",
      student: null,
    });

    vi.mocked(prisma.parentLink.count).mockResolvedValueOnce(0);
    await expect(requireMobileAccount(request)).rejects.toEqual(
      expect.objectContaining<Partial<MobileApiError>>({
        message: "사용할 수 없는 계정입니다",
        status: 403,
      }),
    );
  });

  it("allows offline staff and rejects online-only roles", async () => {
    vi.mocked(getAuthIdentity).mockResolvedValueOnce({
      identity: {
        appUser: { id: "staff-1", role: "MENTOR", status: "ACTIVE" },
        student: null,
      },
    } as never);
    await expect(requireMobileStaff(request)).resolves.toMatchObject({
      id: "staff-1",
    });

    vi.mocked(getAuthIdentity).mockResolvedValueOnce({
      identity: {
        appUser: {
          id: "manager-1",
          role: "MANAGER_MENTOR",
          status: "ACTIVE",
        },
        student: null,
      },
    } as never);
    await expect(requireMobileStaff(request)).rejects.toEqual(
      expect.objectContaining<Partial<MobileApiError>>({
        message: "운영진 계정으로 이용할 수 없습니다",
        status: 403,
      }),
    );
  });

  it("requires a valid session", async () => {
    vi.mocked(getAuthIdentity).mockResolvedValue(null);

    await expect(requireMobileStudent(request)).rejects.toEqual(
      expect.objectContaining<Partial<MobileApiError>>({
        message: "로그인이 필요합니다",
        status: 401,
      }),
    );
  });
});
