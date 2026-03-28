import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    attendanceRecord: { upsert: vi.fn() },
    attendanceSchedule: { deleteMany: vi.fn(), createMany: vi.fn() },
    outingSchedule: { deleteMany: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/utils", () => ({ todayKST: vi.fn(() => new Date("2026-03-25")) }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { upsertAttendance, saveOutingSchedules } from "@/actions/attendance";

const mockSession = { user: { id: "user-1", role: "DIRECTOR", name: "원장" } } as never;

describe("upsertAttendance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession);
  });

  it("is idempotent: calling twice with same student+date only calls upsert (not create)", async () => {
    vi.mocked(prisma.attendanceRecord.upsert).mockResolvedValue({} as never);

    const makeForm = () => {
      const fd = new FormData();
      fd.set("studentId", "student-1");
      fd.set("date", "2026-03-25");
      fd.set("type", "NORMAL");
      fd.set("checkIn", "09:00");
      return fd;
    };

    await upsertAttendance(makeForm());
    await upsertAttendance(makeForm());

    // Both calls go through upsert — the DB handles deduplication
    expect(prisma.attendanceRecord.upsert).toHaveBeenCalledTimes(2);

    // Both calls use the same where key
    const calls = vi.mocked(prisma.attendanceRecord.upsert).mock.calls;
    expect(calls[0][0].where).toEqual(calls[1][0].where);
  });

  it("throws Unauthorized when not logged in", async () => {
    vi.mocked(auth).mockResolvedValue(null);

    const fd = new FormData();
    fd.set("studentId", "student-1");
    fd.set("date", "2026-03-25");
    fd.set("type", "PRESENT");

    await expect(upsertAttendance(fd)).rejects.toThrow("Unauthorized");
  });
});

describe("saveOutingSchedules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession);
    vi.mocked(prisma.outingSchedule.deleteMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.outingSchedule.createMany).mockResolvedValue({ count: 0 } as never);
  });

  it("deletes existing outings and creates new ones", async () => {
    const outings = [
      { dayOfWeek: 1, outStart: "12:00", outEnd: "13:00", reason: "수학학원" },
      { dayOfWeek: 3, outStart: "14:00", outEnd: "15:00", reason: "영어학원" },
    ];

    await saveOutingSchedules("student-1", outings);

    expect(prisma.outingSchedule.deleteMany).toHaveBeenCalledWith({ where: { studentId: "student-1" } });
    expect(prisma.outingSchedule.createMany).toHaveBeenCalledWith({
      data: outings.map((o) => ({ ...o, studentId: "student-1" })),
    });
  });

  it("deletes all outings without calling createMany when list is empty", async () => {
    await saveOutingSchedules("student-1", []);

    expect(prisma.outingSchedule.deleteMany).toHaveBeenCalledWith({ where: { studentId: "student-1" } });
    expect(prisma.outingSchedule.createMany).not.toHaveBeenCalled();
  });

  it("revalidates /students path after saving", async () => {
    await saveOutingSchedules("student-1", []);

    expect(revalidatePath).toHaveBeenCalledWith("/students");
  });

  it("throws Unauthorized when not logged in", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    await expect(saveOutingSchedules("student-1", [])).rejects.toThrow("Unauthorized");
  });
});
