import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ getAuthIdentity: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    appSetting: { findMany: vi.fn(), upsert: vi.fn() },
    student: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/slack", () => ({ notifySlack: vi.fn() }));
vi.mock("@/lib/mobile-workflows", () => ({ updateMobileAttendance: vi.fn() }));

import { handleClassupEvent, verifyClassupSignature } from "@/lib/classup";
import { MobileApiError } from "@/lib/mobile-auth";
import { updateMobileAttendance } from "@/lib/mobile-workflows";
import { prisma } from "@/lib/prisma";
import { notifySlack } from "@/lib/slack";

const sign = (secret: string, ts: string, body: string) =>
  `sha256=${createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex")}`;

describe("verifyClassupSignature", () => {
  const now = 1_800_000_000_000;
  const ts = String(now / 1000);
  const body = '{"type":"resource.changed"}';

  it("맞는 비밀·시각만 통과하고, 교체 중엔 이전 비밀도 받는다", () => {
    expect(verifyClassupSignature(body, ts, sign("new", ts, body), ["new"], now)).toBe(true);
    expect(verifyClassupSignature(body, ts, sign("old", ts, body), ["new", "old"], now)).toBe(true);
    expect(verifyClassupSignature(body, ts, sign("other", ts, body), ["new"], now)).toBe(false);
    expect(verifyClassupSignature(`${body} `, ts, sign("new", ts, body), ["new"], now)).toBe(false);
    expect(verifyClassupSignature(body, ts, sign("new", ts, body), ["new"], now + 6 * 60_000)).toBe(false);
  });
});

describe("handleClassupEvent", () => {
  const change = (sequence: number, studentId: number, studentName: string, eventType: string) => ({
    sequence,
    id: String(sequence),
    operation: "upsert",
    data: { id: sequence, studentId, studentName, classId: null, eventType, occurredAt: "2026-11-09T09:02:00.000000+09:00" },
    changedAt: "2026-11-09T00:02:00Z",
  });
  const delivery = (events: unknown[]) => ({ type: "resource.changed", resource: "attendance", events });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.appSetting.findMany).mockResolvedValue([{ key: "classup.attendance.seq", value: "5" }] as never);
    vi.mocked(prisma.student.findMany).mockImplementation((async (args: { where: { name: string } }) =>
      args.where.name === "김하나" ? [{ id: "stu_1" }] : []) as never);
  });

  it("순번이 지난 건 건너뛰고, 안 되는 동작은 다음 동작으로, 못 찾은 학생은 슬랙으로", async () => {
    vi.mocked(updateMobileAttendance).mockImplementation((async (_id: string, input: { action: string }) => {
      if (input.action === "RETURN") throw new MobileApiError("현재 외출 상태가 아닙니다", 409);
      return { ok: true };
    }) as never);

    const result = await handleClassupEvent(
      delivery([change(7, 1, "김하나", "reenter"), change(5, 1, "김하나", "exit"), change(8, 99, "이둘", "entrance")]),
    );

    expect(result).toEqual({ applied: 1 });
    expect(vi.mocked(updateMobileAttendance).mock.calls.map((c) => [c[0], (c[1] as { action: string }).action])).toEqual([
      ["stu_1", "RETURN"],
      ["stu_1", "CHECK_IN"],
    ]);
    expect(vi.mocked(updateMobileAttendance).mock.calls[0][2]).toEqual(new Date("2026-11-09T00:02:00Z"));
    expect(prisma.appSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { value: "8" } }));
    expect(vi.mocked(notifySlack).mock.calls[0][0]).toContain("이둘(클래스업 #99)");
  });

  it("DB 오류면 반영한 데까지만 순번을 남기고 실패한다 (→ 500 → 재전송)", async () => {
    vi.mocked(updateMobileAttendance)
      .mockResolvedValueOnce({ ok: true } as never)
      .mockRejectedValueOnce(new Error("db down"));

    await expect(
      handleClassupEvent(delivery([change(6, 1, "김하나", "entrance"), change(7, 1, "김하나", "outing")])),
    ).rejects.toThrow("db down");
    expect(prisma.appSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { value: "6" } }));
  });
});
