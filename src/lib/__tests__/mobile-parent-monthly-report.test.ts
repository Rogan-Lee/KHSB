import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    monthlyReport: { findUnique: vi.fn() },
    monthlyNote: { findFirst: vi.fn() },
    meritDemerit: { findMany: vi.fn() },
    patrolRecord: { findMany: vi.fn() },
    examScore: { findMany: vi.fn() },
    vocabTestScore: { findMany: vi.fn() },
    monthlyAdmissionInfo: { findFirst: vi.fn() },
    announcement: { findFirst: vi.fn() },
    monthlyAward: { findMany: vi.fn() },
    photo: { findMany: vi.fn() },
  },
}));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("@/lib/app-url", () => ({ getAppUrl: () => "https://app.example.com" }));

import { prisma } from "@/lib/prisma";
import {
  buildMonthlyExams,
  getParentMonthlyReport,
  monthlyReportRange,
  type MonthlyExamScoreRow,
} from "@/lib/mobile-parent-monthly-report";

const parent = { authUserId: "auth-1", children: [{ id: "student-1" }] };
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const baseReport = {
  id: "mr-1",
  studentId: "student-1",
  year: 2026,
  month: 9,
  sentAt: new Date("2026-10-01T01:00:00.000Z"),
  mentoringCount: 4,
  mentoringSummary: "[이번 달 학습]\n수학 오답 정리를 꾸준히 했어요.",
  overallComment: "  ",
  patrolNoteCount: 2,
  patrolAbsentCount: 1,
  attachedPhotoIds: ["p2", "p-missing", "p1"],
  student: {
    id: "student-1",
    name: "김하늘",
    school: "반송고",
    grade: "고2",
    targetUniversity: "서울대",
  },
};

function mockEmptyMonth() {
  vi.mocked(prisma.monthlyNote.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.meritDemerit.findMany).mockResolvedValue([]);
  vi.mocked(prisma.patrolRecord.findMany).mockResolvedValue([]);
  vi.mocked(prisma.examScore.findMany).mockResolvedValue([]);
  vi.mocked(prisma.vocabTestScore.findMany).mockResolvedValue([]);
  vi.mocked(prisma.monthlyAdmissionInfo.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.announcement.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.monthlyAward.findMany).mockResolvedValue([]);
  vi.mocked(prisma.photo.findMany).mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEmptyMonth();
});

describe("getParentMonthlyReport — 접근 제어", () => {
  it("hides reports that were never sent", async () => {
    vi.mocked(prisma.monthlyReport.findUnique).mockResolvedValue({ ...baseReport, sentAt: null } as never);
    await expect(getParentMonthlyReport(parent, "mr-1")).rejects.toMatchObject({ status: 404 });
    expect(prisma.meritDemerit.findMany).not.toHaveBeenCalled();
  });

  it("hides reports of a child the parent is not linked to", async () => {
    vi.mocked(prisma.monthlyReport.findUnique).mockResolvedValue({
      ...baseReport,
      studentId: "someone-else",
    } as never);
    await expect(getParentMonthlyReport(parent, "mr-1")).rejects.toMatchObject({ status: 404 });
    expect(prisma.examScore.findMany).not.toHaveBeenCalled();
  });

  it("returns 404 for missing or malformed ids without querying further", async () => {
    vi.mocked(prisma.monthlyReport.findUnique).mockResolvedValue(null);
    await expect(getParentMonthlyReport(parent, "nope")).rejects.toMatchObject({ status: 404 });
    await expect(getParentMonthlyReport(parent, "")).rejects.toMatchObject({ status: 404 });
    expect(prisma.monthlyReport.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.monthlyNote.findFirst).not.toHaveBeenCalled();
  });
});

describe("getParentMonthlyReport — 공개 범위와 내용", () => {
  beforeEach(() => {
    vi.mocked(prisma.monthlyReport.findUnique).mockResolvedValue(baseReport as never);
  });

  it("only asks for report-visible notes and merits, within the report month", async () => {
    await getParentMonthlyReport(parent, "mr-1");

    const noteWhere = vi.mocked(prisma.monthlyNote.findFirst).mock.calls[0][0]!.where;
    expect(noteWhere).toMatchObject({ studentId: "student-1", year: 2026, month: 9, visibleInReport: true });

    const meritWhere = vi.mocked(prisma.meritDemerit.findMany).mock.calls[0][0]!.where;
    expect(meritWhere).toEqual({
      studentId: "student-1",
      date: { gte: d("2026-09-01"), lt: d("2026-10-01") },
      visibleInReport: true,
    });

    // 순찰 라운드는 KST 달력 기준 9월 (UTC 8/31 15:00 ~ 9/30 15:00)
    const patrolWhere = vi.mocked(prisma.patrolRecord.findMany).mock.calls[0][0]!.where;
    expect(patrolWhere).toMatchObject({
      studentId: "student-1",
      status: "NOTE",
      round: {
        startedAt: {
          gte: new Date("2026-08-31T15:00:00.000Z"),
          lt: new Date("2026-09-30T15:00:00.000Z"),
        },
      },
    });

    // 성적은 리포트 달 말까지, 최근 행부터
    const examArgs = vi.mocked(prisma.examScore.findMany).mock.calls[0][0]!;
    expect(examArgs.where).toMatchObject({ studentId: "student-1", examDate: { lt: d("2026-10-01") } });
    expect(examArgs.orderBy).toEqual([{ examDate: "desc" }, { createdAt: "desc" }]);
  });

  it("builds the summary, merits, note and patrol notes like the web report", async () => {
    vi.mocked(prisma.monthlyNote.findFirst).mockResolvedValue({ content: "  성실하게 지냈어요.  " } as never);
    vi.mocked(prisma.meritDemerit.findMany).mockResolvedValue([
      { id: "m1", date: d("2026-09-03"), type: "MERIT", points: 2, reason: "자리 정돈", category: "생활" },
      { id: "m2", date: d("2026-09-10"), type: "MERIT", points: 3, reason: "봉사", category: null },
      { id: "m3", date: d("2026-09-12"), type: "DEMERIT", points: 1, reason: "지각", category: "출결" },
    ] as never);
    vi.mocked(prisma.patrolRecord.findMany).mockResolvedValue([
      // KST 9/3 01:00
      { id: "pr1", note: "  휴대폰 사용  ", checkedAt: new Date("2026-09-02T16:00:00.000Z") },
      { id: "pr2", note: "   ", checkedAt: new Date("2026-09-05T10:00:00.000Z") },
    ] as never);

    const r = await getParentMonthlyReport(parent, "mr-1");

    expect(r.student).toEqual(baseReport.student);
    expect(r.summary).toEqual({
      mentoringCount: 4,
      meritPoints: 5,
      demeritPoints: 1,
      meritItemCount: 3,
      patrolNoteCount: 2,
    });
    expect(r.merits.merit).toEqual({ count: 2, points: 5 });
    expect(r.merits.demerit).toEqual({ count: 1, points: 1 });
    expect(r.merits.items[0]).toEqual({
      id: "m1",
      date: "2026-09-03",
      type: "MERIT",
      points: 2,
      reason: "자리 정돈",
      category: "생활",
    });
    expect(r.note).toEqual({ content: "성실하게 지냈어요." });
    expect(r.patrol).toEqual({
      noteCount: 2,
      absentCount: 1,
      notes: [{ id: "pr1", date: "9/3", note: "휴대폰 사용" }],
    });
    // 공백뿐인 원장님 한마디는 숨긴다
    expect(r.directorComment).toBeNull();
    expect(r.mentoringSummary).toContain("수학 오답 정리");
    expect(r.exams).toBeNull();
    expect(r.vocab).toBeNull();
  });

  it("hides a blank monthly note", async () => {
    vi.mocked(prisma.monthlyNote.findFirst).mockResolvedValue({ content: "   " } as never);
    const r = await getParentMonthlyReport(parent, "mr-1");
    expect(r.note).toBeNull();
    expect(r.summary.meritItemCount).toBe(0);
  });

  it("keeps attached photo order and drops deleted photos", async () => {
    vi.mocked(prisma.photo.findMany).mockResolvedValue([
      { id: "p1", url: "https://blob/p1.jpg", thumbnailUrl: "https://blob/p1-t.jpg" },
      { id: "p2", url: "https://blob/p2.jpg", thumbnailUrl: null },
    ] as never);
    const r = await getParentMonthlyReport(parent, "mr-1");
    expect(r.photos.map((p) => p.id)).toEqual(["p2", "p1"]);
    expect(vi.mocked(prisma.photo.findMany).mock.calls[0][0]!.where).toEqual({
      id: { in: ["p2", "p-missing", "p1"] },
    });
  });

  it("marks our child's award without exposing other students' ids", async () => {
    vi.mocked(prisma.monthlyAward.findMany).mockResolvedValue([
      { id: "a1", studentId: "student-1", category: "ATTITUDE", description: " 매일 1등 입실 ", student: { name: "김하늘" } },
      { id: "a2", studentId: "student-9", category: "IMPROVEMENT", description: null, student: { name: "이바다" } },
    ] as never);
    const r = await getParentMonthlyReport(parent, "mr-1");
    expect(r.notices.awards).toEqual([
      {
        id: "a1",
        name: "김하늘",
        category: "ATTITUDE",
        categoryLabel: "학습 태도 우수자",
        description: "매일 1등 입실",
        isMine: true,
      },
      {
        id: "a2",
        name: "이바다",
        category: "IMPROVEMENT",
        categoryLabel: "진보상",
        description: null,
        isMine: false,
      },
    ]);
    expect(JSON.stringify(r.notices)).not.toContain("student-9");
  });

  it("prefers grade-specific admission info, falls back to the common one", async () => {
    vi.mocked(prisma.monthlyAdmissionInfo.findFirst).mockImplementation((async (args: {
      where: { grade: string | null };
    }) => (args.where.grade === null ? { content: "전체 공지" } : null)) as never);
    const r = await getParentMonthlyReport(parent, "mr-1");
    expect(r.admissionInfo).toBe("전체 공지");

    vi.mocked(prisma.monthlyAdmissionInfo.findFirst).mockImplementation((async (args: {
      where: { grade: string | null };
    }) => ({ content: args.where.grade === "고2" ? "고2 공지" : "전체 공지" })) as never);
    const r2 = await getParentMonthlyReport(parent, "mr-1");
    expect(r2.admissionInfo).toBe("고2 공지");
  });

  it("turns relative markdown links and images into absolute URLs", async () => {
    vi.mocked(prisma.announcement.findFirst).mockImplementation((async (args: {
      where: { page: string };
    }) =>
      args.where.page === "monthly_notice"
        ? { content: "![달력](/uploads/cal.png) [안내](/notice) [외부](https://x.com/a)" }
        : { content: "권장 교재" }) as never);
    const r = await getParentMonthlyReport(parent, "mr-1");
    expect(r.notices.operations).toBe(
      "![달력](https://app.example.com/uploads/cal.png) [안내](https://app.example.com/notice) [외부](https://x.com/a)",
    );
    expect(r.notices.recommendation).toBe("권장 교재");
  });

  it("summarises the month's vocab tests", async () => {
    vi.mocked(prisma.vocabTestScore.findMany).mockResolvedValue([
      { id: "v1", testDate: d("2026-09-02"), totalWords: 20, correctWords: 18, score: 90 },
      { id: "v2", testDate: d("2026-09-09"), totalWords: 30, correctWords: 25, score: 83.3333 },
    ] as never);
    const r = await getParentMonthlyReport(parent, "mr-1");
    expect(r.vocab).toEqual({
      count: 2,
      average: 86.7,
      latest: 83.3,
      points: [
        { id: "v1", date: "2026-09-02", score: 90, correct: 18, total: 20 },
        { id: "v2", date: "2026-09-09", score: 83.3, correct: 25, total: 30 },
      ],
    });
  });

  it("passes exam scores oldest-first to the exam builder", async () => {
    vi.mocked(prisma.examScore.findMany).mockResolvedValue([
      { examName: "9월 모평", examType: "OFFICIAL_MOCK", examDate: d("2026-09-03"), subject: "국어", grade: 2, percentile: 91, rawScore: 88 },
      { examName: "6월 모평", examType: "OFFICIAL_MOCK", examDate: d("2026-06-04"), subject: "국어", grade: 3, percentile: 82, rawScore: 80 },
    ] as never);
    const r = await getParentMonthlyReport(parent, "mr-1");
    expect(r.exams?.recent.map((g) => g.name)).toEqual(["6월 모평", "9월 모평"]);
    expect(r.exams?.recent.map((g) => g.isThisMonth)).toEqual([false, true]);
  });
});

describe("buildMonthlyExams", () => {
  const row = (
    date: string,
    examName: string,
    subject: string,
    grade: number | null,
    percentile: number | null = null,
    examType = "OFFICIAL_MOCK",
    rawScore: number | null = null,
  ): MonthlyExamScoreRow => ({ examName, examType, examDate: d(date), subject, grade, percentile, rawScore });

  it("returns null without scores", () => {
    expect(buildMonthlyExams([], 2026, 9)).toBeNull();
  });

  it("picks the latest two exams (older first) and tags only the report month", () => {
    const res = buildMonthlyExams(
      [
        row("2026-03-26", "3월 학평", "국어", 4),
        row("2026-06-04", "6월 모평", "수학", 3),
        row("2026-06-04", "6월 모평", "국어", 2),
        row("2026-08-20", "8월 사설", "영어", 2, null, "PRIVATE_MOCK"),
      ],
      2026,
      9,
    )!;
    expect(res.recent.map((g) => [g.name, g.typeLabel, g.isThisMonth])).toEqual([
      ["6월 모평", "공식 모의", false],
      ["8월 사설", "사설 모의", false],
    ]);
    // 과목은 국어 → 수학 순
    expect(res.recent[0].subjects.map((s) => s.subject)).toEqual(["국어", "수학"]);
  });

  it("does not tag an exam from the last day of the previous month as this month", () => {
    const res = buildMonthlyExams(
      [row("2026-08-31", "8월 말 사설", "국어", 3, null, "PRIVATE_MOCK"), row("2026-09-01", "9월 초", "국어", 2)],
      2026,
      9,
    )!;
    expect(res.recent.map((g) => [g.date, g.isThisMonth])).toEqual([
      ["2026-08-31", false],
      ["2026-09-01", true],
    ]);
  });

  it("averages by exam type per date and keeps per-subject values per exam", () => {
    const res = buildMonthlyExams(
      [
        row("2026-06-04", "6월 모평", "국어", 2, 90),
        row("2026-06-04", "6월 모평", "수학", 3, 85),
        row("2026-06-04", "학교 기말", "수학", 1, null, "SCHOOL_EXAM"),
        row("2026-09-03", "9월 모평", "국어", 1, 97.5),
        row("2026-09-03", "9월 모평", "생활과 윤리", null, 70),
      ],
      2026,
      9,
    )!;
    expect(res.trend.examTypes).toEqual(["OFFICIAL_MOCK", "SCHOOL_EXAM"]);
    expect(res.trend.subjects).toEqual(["국어", "수학", "생활과 윤리"]);
    expect(res.trend.byType).toEqual([
      {
        key: "2026-06-04",
        date: "2026-06-04",
        title: "6월 모평 · 학교 기말",
        grade: { OFFICIAL_MOCK: 2.5, SCHOOL_EXAM: 1 },
        percentile: { OFFICIAL_MOCK: 87.5 },
      },
      {
        key: "2026-09-03",
        date: "2026-09-03",
        title: "9월 모평",
        grade: { OFFICIAL_MOCK: 1 },
        percentile: { OFFICIAL_MOCK: 83.75 },
      },
    ]);
    expect(res.trend.bySubject.map((r) => [r.title, r.grade, r.percentile])).toEqual([
      ["6월 모평", { 국어: 2, 수학: 3 }, { 국어: 90, 수학: 85 }],
      ["학교 기말", { 수학: 1 }, {}],
      ["9월 모평", { 국어: 1 }, { 국어: 97.5, "생활과 윤리": 70 }],
    ]);
  });
});

describe("monthlyReportRange", () => {
  it("handles December → next January", () => {
    const r = monthlyReportRange(2026, 12);
    expect(r.dateStart.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(r.dateEnd.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(r.kstStart.toISOString()).toBe("2026-11-30T15:00:00.000Z");
    expect(r.kstEnd.toISOString()).toBe("2026-12-31T15:00:00.000Z");
  });
});
