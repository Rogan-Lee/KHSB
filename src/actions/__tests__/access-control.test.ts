import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    accessRule: { createMany: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    accessOverride: { createMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    accessDevice: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    accessAgent: { create: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
    accessEvent: { create: vi.fn() },
    appSetting: { findUnique: vi.fn(), upsert: vi.fn() },
    student: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

import {
  cancelAccessOverride,
  createAccessOverrides,
  createAccessRules,
  deleteAccessAgent,
  deleteAccessDevice,
  deleteAccessRule,
  getAccessOverview,
  registerAccessAgent,
  setAccessHardening,
  setAccessPause,
  setAccessRuleEnabled,
  updateAccessDevice,
  updateAccessRuleSchedule,
} from "@/actions/access-control";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashAgentToken } from "@/lib/access-control/store";
import { mockSession } from "./_helpers";

const as = (role: string | null) =>
  vi.mocked(auth).mockResolvedValue(role ? (mockSession({ role: role as never, name: "테스트" }) as never) : null);

const STUDENT = { id: "s1", name: "김학생", grade: "고2" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.accessRule.findMany).mockResolvedValue([]);
  vi.mocked(prisma.student.findMany).mockResolvedValue([STUDENT] as never);
  vi.mocked(prisma.appSetting.findUnique).mockResolvedValue(null);
});

describe("권한", () => {
  // 모든 export 는 공개 엔드포인트다 — 로그인하지 않았거나 권한이 없으면 DB 에 닿기 전에 막혀야 한다
  const managerOnly: [string, () => Promise<unknown>][] = [
    ["createAccessRules", () => createAccessRules({ action: "BLOCK", targetKind: "ALL", scope: "GLOBAL" })],
    ["setAccessRuleEnabled", () => setAccessRuleEnabled("r1", false)],
    ["updateAccessRuleSchedule", () => updateAccessRuleSchedule("r1", {})],
    ["deleteAccessRule", () => deleteAccessRule("r1")],
    ["setAccessPause", () => setAccessPause({ paused: true })],
    ["setAccessHardening", () => setAccessHardening(false)],
    ["registerAccessAgent", () => registerAccessAgent("장비")],
    ["deleteAccessAgent", () => deleteAccessAgent("a1")],
  ];
  const staffOnly: [string, () => Promise<unknown>][] = [
    ["getAccessOverview", () => getAccessOverview()],
    ["createAccessOverrides", () => createAccessOverrides({ action: "ALLOW", targetKind: "ALL", scope: "GLOBAL", minutes: 10 })],
    ["cancelAccessOverride", () => cancelAccessOverride("o1")],
    ["updateAccessDevice", () => updateAccessDevice("d1", { status: "EXEMPT" })],
    ["deleteAccessDevice", () => deleteAccessDevice("d1")],
  ];

  it.each([...managerOnly, ...staffOnly])("%s — 로그인하지 않으면 거부", async (_name, call) => {
    as(null);
    await expect(call()).rejects.toThrow("Forbidden");
  });

  it.each([...managerOnly, ...staffOnly])("%s — 학생·학부모·온라인 전용 역할은 거부", async (_name, call) => {
    for (const role of ["STUDENT", "PARENT", "CONSULTANT", "MANAGER_MENTOR"]) {
      as(role);
      await expect(call()).rejects.toThrow("Forbidden");
    }
  });

  it.each(managerOnly)("%s — 일반 직원은 거부 (원장급만)", async (_name, call) => {
    for (const role of ["MENTOR", "STAFF", "HEAD_MENTOR", "ADMIN"]) {
      as(role);
      await expect(call()).rejects.toThrow("Forbidden");
    }
    expect(prisma.accessRule.createMany).not.toHaveBeenCalled();
    expect(prisma.accessAgent.create).not.toHaveBeenCalled();
    expect(prisma.appSetting.upsert).not.toHaveBeenCalled();
  });
});

describe("createAccessRules", () => {
  beforeEach(() => as("DIRECTOR"));

  it("대상마다 규칙을 만들고 변경 번호를 올린다", async () => {
    const res = await createAccessRules({
      action: "BLOCK",
      targetKind: "SERVICE",
      targets: ["youtube", "kr:dcinside"],
      scope: "GLOBAL",
      daysOfWeek: [1, 2, 3, 4, 5],
      startTime: "09:00",
      endTime: "22:00",
    });
    expect(res).toEqual({ ok: true, created: 2 });
    const data = vi.mocked(prisma.accessRule.createMany).mock.calls[0][0]!.data as Record<string, unknown>[];
    expect(data.map((d) => [d.target, d.label, d.startMinute, d.endMinute])).toEqual([
      ["youtube", "유튜브", 540, 1320],
      ["kr:dcinside", "디시인사이드", 540, 1320],
    ]);
    expect(prisma.appSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { key: "access_control.rev" } }));
  });

  it("사이트 주소를 정리해 저장하고, 규칙 문법이 섞인 입력은 거부한다", async () => {
    await createAccessRules({ action: "BLOCK", targetKind: "DOMAIN", targets: ["https://www.Example.com/a"], scope: "GLOBAL" });
    const data = vi.mocked(prisma.accessRule.createMany).mock.calls[0][0]!.data as Record<string, unknown>[];
    expect(data[0].target).toBe("example.com");

    vi.mocked(prisma.accessRule.createMany).mockClear();
    const bad = await createAccessRules({ action: "BLOCK", targetKind: "DOMAIN", targets: ["x.com^$important"], scope: "GLOBAL" });
    expect(bad.ok).toBe(false);
    expect(prisma.accessRule.createMany).not.toHaveBeenCalled();
  });

  it("목록에 없는 서비스·한쪽만 있는 시간·없는 학생은 거부한다", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    expect((await createAccessRules({ action: "BLOCK", targetKind: "SERVICE", targets: ["nope"], scope: "GLOBAL" })).ok).toBe(false);
    expect(
      (await createAccessRules({ action: "BLOCK", targetKind: "ALL", scope: "GLOBAL", startTime: "09:00" })).ok,
    ).toBe(false);
    vi.mocked(prisma.student.findMany).mockResolvedValue([]);
    expect((await createAccessRules({ action: "BLOCK", targetKind: "ALL", scope: "STUDENT", studentId: "ghost" })).ok).toBe(false);
    expect(prisma.accessRule.createMany).not.toHaveBeenCalled();
  });

  it("같은 규칙은 다시 만들지 않는다", async () => {
    vi.mocked(prisma.accessRule.findMany).mockResolvedValue([
      { target: "youtube", daysOfWeek: [], startMinute: null, endMinute: null },
    ] as never);
    const res = await createAccessRules({ action: "BLOCK", targetKind: "SERVICE", targets: ["youtube"], scope: "GLOBAL" });
    expect(res).toEqual({ ok: false, error: "같은 규칙이 이미 있어요" });
  });
});

describe("createAccessOverrides", () => {
  it("일반 직원도 만들 수 있고, 학생 × 대상만큼 만든다", async () => {
    as("STAFF");
    vi.mocked(prisma.student.findMany).mockResolvedValue([STUDENT, { id: "s2", name: "이학생", grade: "고1" }] as never);
    const res = await createAccessOverrides({
      action: "ALLOW",
      targetKind: "SERVICE",
      targets: ["youtube", "instagram"],
      scope: "STUDENT",
      studentIds: ["s1", "s2"],
      minutes: 30,
    });
    expect(res).toEqual({ ok: true, created: 4 });
    const data = vi.mocked(prisma.accessOverride.createMany).mock.calls[0][0]!.data as { startAt: Date; endAt: Date }[];
    expect(data).toHaveLength(4);
    expect(data[0].endAt.getTime() - data[0].startAt.getTime()).toBe(30 * 60_000);
  });

  it("24시간을 넘거나 학생을 고르지 않으면 거부한다", async () => {
    as("STAFF");
    expect((await createAccessOverrides({ action: "ALLOW", targetKind: "ALL", scope: "GLOBAL", minutes: 24 * 60 + 1 })).ok).toBe(false);
    expect((await createAccessOverrides({ action: "ALLOW", targetKind: "ALL", scope: "STUDENT", studentIds: [], minutes: 10 })).ok).toBe(false);
    expect(prisma.accessOverride.createMany).not.toHaveBeenCalled();
  });
});

describe("registerAccessAgent", () => {
  it("토큰은 응답에만 주고 DB 에는 해시만 넣는다", async () => {
    as("DIRECTOR");
    vi.mocked(prisma.accessAgent.create).mockResolvedValue({ id: "a1" } as never);
    const res = await registerAccessAgent("  1층 장비 ");
    if (!res.ok) throw new Error("expected ok");
    expect(res.token).toMatch(/^srmag_[A-Za-z0-9_-]{40,}$/);
    const data = vi.mocked(prisma.accessAgent.create).mock.calls[0][0].data;
    expect(data.name).toBe("1층 장비");
    expect(data.tokenHash).toBe(hashAgentToken(res.token));
    expect(JSON.stringify(data)).not.toContain(res.token);
    expect(data.tokenHint).toBe(res.token.slice(-4));
  });
});
