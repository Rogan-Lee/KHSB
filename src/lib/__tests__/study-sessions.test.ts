import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = {
  studySession: { findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    studySession: { findMany: vi.fn() },
    $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  },
}));
vi.mock("@/lib/auth", () => ({ getAuthIdentity: vi.fn() }));

import { MobileApiError } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { kstDayStart, sessionMinutes, summarize, timerAction } from "@/lib/study-sessions";

// 2026-11-17 15:00 KST
const NOW = new Date("2026-11-17T06:00:00Z");
const at = (kst: string) => new Date(`${kst}+09:00`);

beforeEach(() => vi.clearAllMocks());

describe("타이머 계산", () => {
  it("KST 자정 기준으로 하루를 자른다", () => {
    expect(kstDayStart(NOW).toISOString()).toBe("2026-11-16T15:00:00.000Z");
  });

  it("진행 중이면 지금까지, 정지 안 한 기록은 3시간까지만", () => {
    expect(sessionMinutes({ startedAt: at("2026-11-17T14:00:00"), endedAt: null }, NOW)).toBe(60);
    expect(sessionMinutes({ startedAt: at("2026-11-17T09:00:00"), endedAt: null }, NOW)).toBe(180);
    expect(sessionMinutes({ startedAt: at("2026-11-17T10:00:00"), endedAt: at("2026-11-17T10:40:00") }, NOW)).toBe(40);
  });

  it("오늘 시작한 기록만 합치고 과목별로 많은 순, 3시간 지난 열린 기록은 진행 중이 아니다", () => {
    const s = summarize(
      [
        { subject: "수학", startedAt: at("2026-11-16T23:00:00"), endedAt: at("2026-11-17T00:30:00") }, // 어제 시작 → 제외
        { subject: "영어", startedAt: at("2026-11-17T09:00:00"), endedAt: at("2026-11-17T09:30:00") },
        { subject: "수학", startedAt: at("2026-11-17T10:00:00"), endedAt: at("2026-11-17T11:00:00") },
        { subject: "수학", startedAt: at("2026-11-17T14:30:00"), endedAt: null },
      ],
      NOW,
    );
    expect(s.totalMinutes).toBe(120);
    expect(s.bySubject).toEqual([
      { subject: "수학", minutes: 90 },
      { subject: "영어", minutes: 30 },
    ]);
    expect(s.active).toEqual({ subject: "수학", startedAt: at("2026-11-17T14:30:00").toISOString() });

    const stale = summarize([{ subject: null, startedAt: at("2026-11-17T08:00:00"), endedAt: null }], NOW);
    expect(stale.active).toBeNull();
    expect(stale.totalMinutes).toBe(180);
  });
});

describe("timerAction", () => {
  beforeEach(() => vi.mocked(prisma.studySession.findMany).mockResolvedValue([] as never));

  it("시작하면 열린 기록을 먼저 닫고(3시간 넘은 건 3시간 시점) 새로 연다", async () => {
    tx.studySession.findMany.mockResolvedValue([{ id: "old", subject: "국어", startedAt: at("2026-11-17T10:00:00") }]);
    await timerAction("s1", { action: "start", subject: " 수학 " }, NOW);
    expect(tx.studySession.update).toHaveBeenCalledWith({
      where: { id: "old" },
      data: { endedAt: at("2026-11-17T13:00:00") },
    });
    expect(tx.studySession.create).toHaveBeenCalledWith({ data: { studentId: "s1", subject: "수학", startedAt: NOW } });
  });

  it("정지는 닫기만, 계속은 같은 과목으로 다시 연다", async () => {
    tx.studySession.findMany.mockResolvedValue([{ id: "cur", subject: "영어", startedAt: at("2026-11-17T13:30:00") }]);
    await timerAction("s1", { action: "stop" }, NOW);
    expect(tx.studySession.update).toHaveBeenCalledWith({ where: { id: "cur" }, data: { endedAt: NOW } });
    expect(tx.studySession.create).not.toHaveBeenCalled();

    await timerAction("s1", { action: "keep" }, NOW);
    expect(tx.studySession.create).toHaveBeenCalledWith({ data: { studentId: "s1", subject: "영어", startedAt: NOW } });
  });

  it("진행 중인 기록이 없으면 계속할 수 없다", async () => {
    tx.studySession.findMany.mockResolvedValue([]);
    const error = await timerAction("s1", { action: "keep" }, NOW).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MobileApiError);
    expect((error as MobileApiError).message).toBe("진행 중인 타이머가 없어요");
    await expect(timerAction("s1", { action: "pause" }, NOW)).rejects.toThrow("타이머 동작을 확인해 주세요");
  });
});
