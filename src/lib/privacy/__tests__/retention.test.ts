import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  waitlist: { count: vi.fn(), deleteMany: vi.fn() },
  phoneVerification: { count: vi.fn(), deleteMany: vi.fn() },
  personalDataAccessLog: { count: vi.fn(), deleteMany: vi.fn() },
  aiTransferLog: { count: vi.fn(), deleteMany: vi.fn() },
  student: { count: vi.fn(), deleteMany: vi.fn() },
  appSetting: { upsert: vi.fn() },
  $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { expiredStudentWhere, expiredWaitlistWhere, retentionCutoffs, runRetention } from "../retention";

const now = new Date("2026-11-22T00:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  for (const t of [db.waitlist, db.phoneVerification, db.personalDataAccessLog, db.aiTransferLog]) {
    t.count.mockResolvedValue(2);
    t.deleteMany.mockResolvedValue({ count: 2 });
  }
  db.student.count.mockResolvedValue(0);
  delete process.env.RETENTION_PURGE;
});

describe("보유 기간", () => {
  it("처리방침과 같은 기간으로 자른다", () => {
    const cut = retentionCutoffs(now);
    expect(cut.waitlist.toISOString().slice(0, 10)).toBe("2025-11-22");
    expect(cut.student.toISOString().slice(0, 10)).toBe("2023-11-22");
    expect(cut.log.toISOString().slice(0, 10)).toBe("2024-11-22");
  });

  it("응대 전 신청·등록된 학생의 신청·종료일 없는 학생은 대상이 아니다", () => {
    const w = expiredWaitlistWhere(now);
    expect(w.studentId).toBeNull();
    expect(JSON.stringify(w)).not.toContain("WAITING");
    expect(expiredStudentWhere(now)).toEqual({ status: { in: ["WITHDRAWN", "GRADUATED"] }, endDate: { lt: now } });
  });
});

describe("runRetention", () => {
  it("RETENTION_PURGE=0 이면 건수만 세고 아무것도 지우지 않는다", async () => {
    process.env.RETENTION_PURGE = "0";
    const r = await runRetention(now);
    expect(r.purged).toBeNull();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.waitlist.deleteMany).not.toHaveBeenCalled();
    expect(db.appSetting.upsert).toHaveBeenCalledOnce();
  });

  it("기본은 지우되 학생은 지우지 않는다", async () => {
    const r = await runRetention(now);
    expect(r.purged).toEqual({ waitlist: 2, phoneVerification: 2, logs: 4 });
    expect(db.student.deleteMany).not.toHaveBeenCalled();
  });
});
