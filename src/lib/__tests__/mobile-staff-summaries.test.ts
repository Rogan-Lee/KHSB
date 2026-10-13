import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    student: { findMany: vi.fn() },
    mentoring: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/attention", () => ({ getAttentionStudents: vi.fn(async () => []) }));

import {
  getStaffMobileAttendance,
  getStaffMobileAttendanceSummary,
  getStaffMobileMentoring,
  getStaffMobileMentoringSummary,
} from "@/lib/mobile-data";
import { prisma } from "@/lib/prisma";

const findStudents = prisma.student.findMany as unknown as ReturnType<typeof vi.fn>;
const findMentorings = prisma.mentoring.findMany as unknown as ReturnType<typeof vi.fn>;

// 2026-06-20 10:00 KST
const now = new Date("2026-06-20T01:00:00.000Z");
const kst = (hm: string) => new Date(`2026-06-20T${hm}:00+09:00`);

function student(
  id: string,
  opts: {
    attendance?: Partial<Record<"checkIn" | "checkOut" | "outStart" | "outEnd", Date>> & {
      type?: string;
    };
    start?: string;
    dailyOutings?: { outStart: Date | null; outEnd: Date | null }[];
  } = {},
) {
  return {
    id,
    name: id,
    grade: "고3",
    school: null,
    seat: id,
    phone: null,
    parentPhone: "",
    dailyNote: null,
    dailyNoteDate: null,
    attentionFlag: false,
    attentionReason: null,
    attendances: opts.attendance
      ? [
          {
            checkIn: opts.attendance.checkIn ?? null,
            checkOut: opts.attendance.checkOut ?? null,
            outStart: opts.attendance.outStart ?? null,
            outEnd: opts.attendance.outEnd ?? null,
            type: opts.attendance.type ?? "NORMAL",
            notes: null,
          },
        ]
      : [],
    schedules: opts.start ? [{ startTime: opts.start, endTime: "22:00" }] : [],
    outings: [{ outStart: "12:00", outEnd: "13:00", reason: "학원" }],
    dailyOutings: (opts.dailyOutings ?? []).map((o, i) => ({
      id: `${id}-o${i}`,
      sequence: i + 1,
      reason: null,
      isPlaceholder: false,
      ...o,
    })),
    _count: { communications: 0 },
  };
}

beforeEach(() => vi.clearAllMocks());

describe("getStaffMobileAttendanceSummary", () => {
  it("목록(getStaffMobileAttendance)과 같은 상태 집계를 낸다", async () => {
    const rows = [
      student("s1", { attendance: { checkIn: kst("08:50") }, start: "09:00" }),
      student("s2", {
        attendance: { checkIn: kst("08:00") },
        dailyOutings: [{ outStart: kst("09:30"), outEnd: null }],
      }),
      student("s3", {
        attendance: { checkIn: kst("08:00"), checkOut: kst("09:40") },
        dailyOutings: [{ outStart: kst("09:00"), outEnd: kst("09:20") }],
      }),
      student("s4", { start: "09:00" }), // 미입실 + 30분 지남 → 지각
      student("s5", { start: "09:50" }), // 미입실, 아직 30분 안 지남
      student("s6", { attendance: { type: "ABSENT" } }),
      student("s7", { attendance: { checkIn: kst("08:00"), outStart: kst("09:00") } }), // 레거시 외출
      student("s8"),
    ];
    findStudents.mockResolvedValue(rows);

    const full = await getStaffMobileAttendance(now);
    const lean = await getStaffMobileAttendanceSummary(now);

    expect(lean).toEqual({
      absent: full.summary.absent,
      away: full.summary.away,
      inRoom: full.items.filter((i) => i.status === "입실").length,
      late: full.summary.late,
      notArrived: full.items.filter((i) => i.status === "미입실").length,
      present: full.summary.present,
      total: full.summary.total,
    });
    expect(lean).toEqual({
      absent: 1,
      away: 2,
      inRoom: 1,
      late: 1,
      notArrived: 3,
      present: 3,
      total: 8,
    });
    // 집계용 조회는 목록 표시 컬럼(이름·연락처·메모)을 읽지 않는다
    const select = findStudents.mock.calls[1][0].select;
    expect(Object.keys(select).sort()).toEqual(["attendances", "dailyOutings", "schedules"]);
  });
});

describe("getStaffMobileMentoringSummary", () => {
  it("목록 summary 와 같은 값을 같은 범위(100건)로 센다", async () => {
    const sessions = [
      { scheduledAt: new Date("2026-06-19T00:00:00.000Z"), scheduledTimeStart: "19:00" },
      { scheduledAt: new Date("2026-06-20T00:00:00.000Z"), scheduledTimeStart: "09:00" },
      { scheduledAt: new Date("2026-06-20T00:00:00.000Z"), scheduledTimeStart: "15:00" },
      { scheduledAt: new Date("2026-06-20T05:00:00.000Z"), scheduledTimeStart: null },
      { scheduledAt: new Date("2026-06-21T00:00:00.000Z"), scheduledTimeStart: "10:00" },
    ].map((s, i) => ({
      ...s,
      id: `m${i}`,
      status: "SCHEDULED",
      mentor: { name: "멘토" },
      student: { grade: "고3", id: "s1", name: "학생" },
    }));
    findMentorings.mockResolvedValue(sessions);

    const full = await getStaffMobileMentoring("u1", "MENTOR", now);
    const lean = await getStaffMobileMentoringSummary("u1", "MENTOR", now);

    expect(lean).toEqual(full.summary);
    expect(lean).toEqual({ needsRecord: 2, today: 3 });
    const [listArgs, leanArgs] = findMentorings.mock.calls.map((c) => c[0]);
    expect(leanArgs.where).toEqual(listArgs.where);
    expect(leanArgs.orderBy).toEqual(listArgs.orderBy);
    expect(leanArgs.take).toBe(100);
    expect(leanArgs.select).toEqual({ scheduledAt: true, scheduledTimeStart: true });
  });
});
