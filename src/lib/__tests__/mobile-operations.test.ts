import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    handover: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    handoverChecklist: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    handoverRead: {
      upsert: vi.fn(),
    },
    handoverTask: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    patrolRecord: {
      upsert: vi.fn(),
    },
    patrolRound: {
      findUnique: vi.fn(),
    },
    student: {
      findUnique: vi.fn(),
    },
    workTag: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  createMobileHandover,
  saveMobilePatrolRecord,
  updateMobileClock,
} from "@/lib/mobile-operations";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateMobileClock", () => {
  it("rejects duplicate clock-in records", async () => {
    vi.mocked(prisma.workTag.findFirst).mockResolvedValue({
      type: "CLOCK_IN",
    } as never);

    await expect(
      updateMobileClock("u1", { action: "CLOCK_IN" }),
    ).rejects.toThrow("이미 출근 상태입니다");
    expect(prisma.workTag.create).not.toHaveBeenCalled();
  });

  it("allows clock-out only after clock-in", async () => {
    vi.mocked(prisma.workTag.findFirst).mockResolvedValue({
      type: "CLOCK_IN",
    } as never);
    vi.mocked(prisma.workTag.create).mockResolvedValue({
      id: "tag2",
      note: null,
      taggedAt: new Date("2026-06-20T10:00:00.000Z"),
      type: "CLOCK_OUT",
    } as never);

    const result = await updateMobileClock(
      "u1",
      { action: "CLOCK_OUT" },
      new Date("2026-06-20T10:00:00.000Z"),
    );

    expect(result.type).toBe("CLOCK_OUT");
    expect(prisma.workTag.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "CLOCK_OUT",
          userId: "u1",
        }),
      }),
    );
  });
});

describe("createMobileHandover", () => {
  it("trims and stores a mobile handover for the KST day", async () => {
    vi.mocked(prisma.handover.create).mockResolvedValue({
      authorId: "u1",
      authorName: "관리자",
      category: "마감",
      checklist: [],
      content: "출입문 확인",
      createdAt: new Date("2026-06-20T10:00:00.000Z"),
      date: new Date("2026-06-20T00:00:00.000Z"),
      id: "h1",
      isPinned: false,
      priority: "URGENT",
      reads: [],
      recipientName: null,
      tasks: [],
    } as never);

    const result = await createMobileHandover(
      { id: "u1", name: "관리자" },
      {
        category: " 마감 ",
        content: " 출입문 확인 ",
        priority: "URGENT",
      },
      new Date("2026-06-20T10:00:00.000Z"),
    );

    expect(result.content).toBe("출입문 확인");
    expect(prisma.handover.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          category: "마감",
          content: "출입문 확인",
          priority: "URGENT",
        }),
      }),
    );
  });
});

describe("saveMobilePatrolRecord", () => {
  it("rejects writes to an ended patrol round", async () => {
    vi.mocked(prisma.patrolRound.findUnique).mockResolvedValue({
      endedAt: new Date("2026-06-20T09:00:00.000Z"),
    } as never);
    vi.mocked(prisma.student.findUnique).mockResolvedValue({
      id: "s1",
      status: "ACTIVE",
    } as never);

    await expect(
      saveMobilePatrolRecord("r1", {
        status: "OK",
        studentId: "s1",
      }),
    ).rejects.toThrow("이미 종료된 순찰입니다");
    expect(prisma.patrolRecord.upsert).not.toHaveBeenCalled();
  });
});
