import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    scheduleProposal: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    dailyPlan: { upsert: vi.fn(), findMany: vi.fn() },
    examSession: { findMany: vi.fn(), findUnique: vi.fn() },
    examSeatAssignment: { findMany: vi.fn() },
    examApplication: { findUnique: vi.fn(), deleteMany: vi.fn(), upsert: vi.fn() },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/slack", () => ({ notifySlack: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuthIdentity: vi.fn() }));

import { MobileApiError } from "@/lib/mobile-auth";
import {
  cancelMobileStudentExam,
  getMobileStudentExams,
  getStudentPlansRange,
  saveMobileStudentPlan,
  saveMobileStudentPlans,
  submitMobileStudentScheduleProposal,
} from "@/lib/mobile-student-plan";
import { prisma } from "@/lib/prisma";
import { todayKST } from "@/lib/utils";

const STUDENT = "student-1";

async function expectApiError(p: Promise<unknown>, status: number, message: string) {
  const error = await p.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(MobileApiError);
  expect((error as MobileApiError).status).toBe(status);
  expect((error as MobileApiError).message).toBe(message);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("submitMobileStudentScheduleProposal", () => {
  const monday = { dayOfWeek: 1, startTime: "09:00", endTime: "22:00" };

  it("등하원 요일이 없으면 웹과 같은 문구로 거절한다", async () => {
    await expectApiError(
      submitMobileStudentScheduleProposal(STUDENT, { attendance: [], outings: [] }),
      400,
      "등하원 요일을 1개 이상 선택해 주세요",
    );
    expect(prisma.scheduleProposal.create).not.toHaveBeenCalled();
  });

  it("하원이 등원보다 빠르거나 같은 요일이 두 번이면 거절한다", async () => {
    await expectApiError(
      submitMobileStudentScheduleProposal(STUDENT, {
        attendance: [{ dayOfWeek: 2, startTime: "22:00", endTime: "09:00" }],
        outings: [],
      }),
      400,
      "하원 시간은 등원 시간보다 늦어야 해요",
    );
    await expectApiError(
      submitMobileStudentScheduleProposal(STUDENT, { attendance: [monday, monday], outings: [] }),
      400,
      "같은 요일이 두 번 들어갔어요",
    );
    await expectApiError(
      submitMobileStudentScheduleProposal(STUDENT, {
        attendance: [{ ...monday, startTime: "9:00" }],
        outings: [],
      }),
      400,
      "등원 시간을 확인해 주세요",
    );
  });

  it("다음 버전으로 제출값 = 제안 초기값을 기록하고 빈 사유·메모는 null 로 저장한다", async () => {
    vi.mocked(prisma.scheduleProposal.findFirst).mockResolvedValue({ version: 3 } as never);
    vi.mocked(prisma.scheduleProposal.create).mockResolvedValue({ id: "p-4" } as never);

    const result = await submitMobileStudentScheduleProposal(STUDENT, {
      attendance: [monday],
      outings: [{ dayOfWeek: 1, outStart: "18:00", outEnd: "20:00", reason: "  " }],
      memo: "   ",
    });

    expect(result).toEqual({ id: "p-4", version: 4 });
    const outings = [{ dayOfWeek: 1, outStart: "18:00", outEnd: "20:00", reason: null }];
    expect(prisma.scheduleProposal.create).toHaveBeenCalledWith({
      data: {
        studentId: STUDENT,
        version: 4,
        status: "SUBMITTED",
        submittedAttendance: [monday],
        submittedOutings: outings,
        studentMemo: null,
        proposedAttendance: [monday],
        proposedOutings: outings,
      },
    });
  });
});

describe("saveMobileStudentPlan", () => {
  const item = { id: "a", text: "수학 문제집 30p", done: false };

  it("지난 7일~4주 뒤 밖의 날짜는 거절한다", async () => {
    await expectApiError(
      saveMobileStudentPlan(STUDENT, { date: "2000-01-01", items: [item] }),
      400,
      "지난 7일부터 4주 뒤까지의 계획만 고칠 수 있어요",
    );
    expect(prisma.dailyPlan.upsert).not.toHaveBeenCalled();
  });

  it("오늘 계획은 항목 전체를 교체 저장한다", async () => {
    const today = todayKST().toISOString().slice(0, 10);
    await saveMobileStudentPlan(STUDENT, { date: today, items: [item] });
    expect(prisma.dailyPlan.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId_date: { studentId: STUDENT, date: new Date(today) } },
        update: { items: [{ id: "a", text: "수학 문제집 30p", done: false, colorCode: "blue" }] },
      }),
    );
  });

  it("대시보드가 만든 빈 항목(빈 text·duration null)이 섞여 있어도 저장한다", async () => {
    const tomorrow = new Date(todayKST().getTime() + 86_400_000).toISOString().slice(0, 10);
    await saveMobileStudentPlan(STUDENT, {
      date: tomorrow,
      items: [item, { id: "V1StGXR8_Z5jdHi6B-myT", text: "", done: true, colorCode: "red", duration: null }],
    });
    expect(prisma.dailyPlan.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          items: [
            { id: "a", text: "수학 문제집 30p", done: false, colorCode: "blue" },
            { id: "V1StGXR8_Z5jdHi6B-myT", text: "", done: true, colorCode: "red" },
          ],
        },
      }),
    );
  });
});

describe("모의고사", () => {
  it("확정된 신청은 앱에서 취소할 수 없다", async () => {
    vi.mocked(prisma.examApplication.findUnique).mockResolvedValue({ status: "CONFIRMED" } as never);
    await expectApiError(
      cancelMobileStudentExam(STUDENT, "s1"),
      409,
      "확정된 신청은 운영진에게 문의해 취소해 주세요",
    );
    expect(prisma.examApplication.deleteMany).not.toHaveBeenCalled();
  });

  it("접수 중 신청은 취소(행 삭제)한다", async () => {
    vi.mocked(prisma.examApplication.findUnique).mockResolvedValue({ status: "PENDING" } as never);
    vi.mocked(prisma.examApplication.deleteMany).mockResolvedValue({ count: 1 } as never);
    await expect(cancelMobileStudentExam(STUDENT, "s1")).resolves.toEqual({ ok: true });
    expect(prisma.examApplication.deleteMany).toHaveBeenCalledWith({
      where: { sessionId: "s1", studentId: STUDENT },
    });
  });

  it("접수 중 시험 + 마감됐지만 내가 신청·배정된 시험을 날짜순으로 합치고 좌석을 붙인다", async () => {
    const d = (s: string) => new Date(`${s}T00:00:00Z`);
    vi.mocked(prisma.examSession.findMany)
      .mockResolvedValueOnce([
        {
          id: "open",
          title: "10월 모의고사",
          examDate: d("2099-10-10"),
          examType: "OFFICIAL_MOCK",
          subjects: ["국어"],
          notes: null,
          applications: [{ status: "PENDING", memo: "탐구 생명" }],
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: "closed",
          title: "9월 모의고사",
          examDate: d("2099-09-01"),
          examType: "PRIVATE_MOCK",
          subjects: [],
          notes: "8시까지 입실",
          applications: [],
        },
      ] as never);
    vi.mocked(prisma.examSeatAssignment.findMany).mockResolvedValue([
      { sessionId: "closed", seatNumber: 12 },
    ] as never);

    const { sessions } = await getMobileStudentExams(STUDENT);

    expect(sessions.map((s) => s.sessionId)).toEqual(["closed", "open"]);
    expect(sessions[0]).toMatchObject({
      applicationOpen: false,
      myStatus: "CONFIRMED",
      seatNumber: 12,
      examTypeLabel: "사설 모의고사",
    });
    expect(sessions[1]).toMatchObject({
      applicationOpen: true,
      myStatus: "PENDING",
      myMemo: "탐구 생명",
      seatNumber: null,
    });
  });
});

const dayStr = (offset: number) => new Date(todayKST().getTime() + offset * 86_400_000).toISOString().slice(0, 10);

describe("공부 플래너", () => {
  const item = { id: "a", text: "수학 문제집 30p", done: false, colorCode: "red", subject: "수학", duration: 60 };

  it("내일로 미루기 — 두 날짜를 한 트랜잭션으로 저장하고 과목·목표 시간은 그대로 남긴다", async () => {
    await saveMobileStudentPlans(STUDENT, {
      days: [
        { date: dayStr(0), items: [] },
        { date: dayStr(1), items: [item] },
      ],
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.dailyPlan.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.dailyPlan.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ update: { items: [item] } }),
    );
  });

  it("한 날짜라도 범위를 벗어나면 아무것도 저장하지 않는다", async () => {
    await expectApiError(
      saveMobileStudentPlans(STUDENT, {
        days: [
          { date: dayStr(0), items: [item] },
          { date: dayStr(-8), items: [item] },
        ],
      }),
      400,
      "지난 7일부터 4주 뒤까지의 계획만 고칠 수 있어요",
    );
    expect(prisma.dailyPlan.upsert).not.toHaveBeenCalled();
    await expectApiError(
      saveMobileStudentPlans(STUDENT, { days: [{ date: dayStr(0), items: [] }, { date: dayStr(0), items: [] }] }),
      400,
      "같은 날짜가 두 번 들어갔어요",
    );
  });

  it("기간 조회는 계획 없는 날을 빈 목록으로 채우고 42일을 넘으면 거절한다", async () => {
    vi.mocked(prisma.dailyPlan.findMany).mockResolvedValue([
      { date: new Date("2026-11-17"), items: [item] },
    ] as never);
    const res = await getStudentPlansRange(STUDENT, "2026-11-16", "2026-11-22");
    expect(res.days).toHaveLength(7);
    expect(res.days[1]).toEqual({ date: "2026-11-17", items: [item] });
    expect(res.days[0]).toEqual({ date: "2026-11-16", items: [] });

    await expectApiError(getStudentPlansRange(STUDENT, "2026-01-01", "2026-03-01"), 400, "조회 기간을 확인해 주세요");
    await expectApiError(getStudentPlansRange(STUDENT, "2026-11-22", "2026-11-16"), 400, "조회 기간을 확인해 주세요");
  });
});
