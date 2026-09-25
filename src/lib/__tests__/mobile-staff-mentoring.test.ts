import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    mentoring: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/mobile-workflows", () => ({ getMobileMentoringRecord: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getStaffMentoringSchedule } from "@/lib/mobile-staff-mentoring";

// 2026-09-24(목) 14:00 KST
const NOW = new Date("2026-09-24T05:00:00Z");

function row(over: Record<string, unknown>) {
  return {
    id: "m1",
    mentorId: "mentor-1",
    mentor: { name: "김멘토" },
    scheduledAt: new Date("2026-09-24T00:00:00Z"),
    scheduledTimeStart: null,
    scheduledTimeEnd: null,
    status: "SCHEDULED",
    student: { grade: "고2", id: "s1", name: "이학생", seat: "12" },
    parentReports: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getStaffMentoringSchedule", () => {
  it("classifies today's sessions by KST start time and status", async () => {
    vi.mocked(prisma.mentoring.findMany)
      .mockResolvedValueOnce([
        // 오늘 10:00 — 지났고 기록 전 → 기록 필요
        row({ id: "past", scheduledTimeStart: "10:00", scheduledTimeEnd: "11:00" }),
        // 오늘 18:00 — 아직 → 예정
        row({ id: "later", scheduledTimeStart: "18:00" }),
        // 완료
        row({ id: "done", scheduledTimeStart: "09:00", status: "COMPLETED", parentReports: [{ id: "r" }] }),
        // 어제(KST) — 범위 밖
        row({ id: "yesterday", scheduledAt: new Date("2026-09-23T00:00:00Z"), scheduledTimeStart: "10:00" }),
      ] as never)
      .mockResolvedValueOnce([] as never);

    const result = await getStaffMentoringSchedule({ id: "director-1", role: "DIRECTOR" }, "today", NOW);

    expect(result.range).toBe("today");
    expect(result.today).toBe("2026-09-24");
    expect(result.items.map((i) => [i.id, i.state])).toEqual([
      ["done", "COMPLETED"],
      ["past", "NEEDS_RECORD"],
      ["later", "SCHEDULED"],
    ]);
    expect(result.items.find((i) => i.id === "past")).toMatchObject({
      timeLabel: "10:00",
      endTimeLabel: "11:00",
      stateLabel: "기록 필요",
      isMine: false,
    });
    expect(result.items.find((i) => i.id === "done")?.hasParentReport).toBe(true);
    expect(result.summary).toMatchObject({ total: 3, scheduled: 1, needsRecord: 1, completed: 1 });
    expect(result.scope).toBe("all");
  });

  it("uses a Monday–Sunday KST week and lists older unrecorded sessions as backlog", async () => {
    vi.mocked(prisma.mentoring.findMany)
      .mockResolvedValueOnce([
        row({ id: "mon", scheduledAt: new Date("2026-09-21T01:00:00Z") }), // 월 10:00 KST
        row({ id: "sun", scheduledAt: new Date("2026-09-27T01:00:00Z") }), // 일 10:00 KST
        row({ id: "next-mon", scheduledAt: new Date("2026-09-28T01:00:00Z") }), // 다음 주
      ] as never)
      .mockResolvedValueOnce([
        row({ id: "old", scheduledAt: new Date("2026-09-18T01:00:00Z") }), // 지난주 금
      ] as never);

    const result = await getStaffMentoringSchedule({ id: "mentor-1", role: "MENTOR" }, "week", NOW);

    expect(result.startDate).toBe("2026-09-21");
    expect(result.endDate).toBe("2026-09-27");
    expect(result.items.map((i) => i.id)).toEqual(["mon", "sun"]);
    expect(result.items[0]).toMatchObject({ timeLabel: "10:00", isMine: true });
    expect(result.backlog.map((i) => [i.id, i.state])).toEqual([["old", "NEEDS_RECORD"]]);
    expect(result.scope).toBe("mine");
    // 멘토는 본인 멘토링만 조회
    expect(vi.mocked(prisma.mentoring.findMany).mock.calls[0][0]).toMatchObject({
      where: { mentorId: "mentor-1" },
    });
  });

  it("treats date-only schedules as time-less", async () => {
    vi.mocked(prisma.mentoring.findMany)
      .mockResolvedValueOnce([row({ id: "dateonly", scheduledAt: new Date("2026-09-24T00:00:00Z") })] as never)
      .mockResolvedValueOnce([] as never);

    const result = await getStaffMentoringSchedule({ id: "staff-1", role: "STAFF" }, null, NOW);
    expect(result.range).toBe("today");
    expect(result.items[0]).toMatchObject({ id: "dateonly", timeLabel: null });
  });
});
