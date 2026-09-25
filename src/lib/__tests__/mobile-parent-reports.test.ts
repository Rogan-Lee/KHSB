import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieSet = vi.fn();

vi.mock("@/lib/prisma", () => {
  const report = () => ({
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    updateMany: vi.fn(async () => ({ count: 1 })),
  });
  return {
    prisma: {
      parentReport: report(),
      monthlyReport: report(),
      onlineParentReport: report(),
      studyPlanReport: report(),
      consultationReport: report(),
      authVerification: { create: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn() },
      parentLink: { findUnique: vi.fn() },
      monthlyNote: { findFirst: vi.fn() },
      meritDemerit: { findMany: vi.fn() },
      vocabTestScore: { findMany: vi.fn() },
      vocabAttempt: { findMany: vi.fn() },
      examScore: { findMany: vi.fn() },
    },
  };
});
vi.mock("@/actions/analytics", () => ({ getStudentAnalytics: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set: cookieSet, get: vi.fn(), delete: vi.fn() })),
  headers: vi.fn(),
}));
vi.mock("@/lib/app-url", () => ({ getAppUrl: () => "https://app.example.com" }));

import { getStudentAnalytics } from "@/actions/analytics";
import { prisma } from "@/lib/prisma";
import {
  getParentReportDetail,
  listParentReports,
  openParentReport,
  parseMentoringNote,
  redeemParentHandoff,
  type ParentConsultationReportDetail,
  type ParentMentoringReportDetail,
  type ParentOnlineReportDetail,
  type ParentStudyPlanReportDetail,
} from "@/lib/mobile-parent-reports";
import { hashToken } from "@/lib/token-auth";

const parent = { authUserId: "auth-1", children: [{ id: "student-1" }] };
const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
const future = new Date(Date.now() + 24 * 60 * 60 * 1000);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.authVerification.deleteMany).mockResolvedValue({ count: 0 });
});

describe("openParentReport", () => {
  it("hides reports of a child the parent is not linked to", async () => {
    vi.mocked(prisma.parentReport.findUnique).mockResolvedValue({
      id: "r1",
      token: "tok",
      studentId: "someone-else",
      expiresAt: future,
      revokedAt: null,
    } as never);

    await expect(openParentReport(parent, "mentoring", "r1")).rejects.toMatchObject({ status: 404 });
    expect(prisma.authVerification.create).not.toHaveBeenCalled();
  });

  it("hides revoked reports", async () => {
    vi.mocked(prisma.parentReport.findUnique).mockResolvedValue({
      id: "r1",
      token: "tok",
      studentId: "student-1",
      expiresAt: future,
      revokedAt: past,
    } as never);

    await expect(openParentReport(parent, "mentoring", "r1")).rejects.toMatchObject({ status: 404 });
  });

  it("falls back to the native summary when the web token expired", async () => {
    vi.mocked(prisma.parentReport.findUnique).mockResolvedValue({
      id: "r1",
      token: "tok",
      studentId: "student-1",
      expiresAt: past,
      revokedAt: null,
    } as never);

    await expect(openParentReport(parent, "mentoring", "r1")).resolves.toEqual({
      mode: "native",
      url: null,
    });
    expect(prisma.authVerification.create).not.toHaveBeenCalled();
  });

  it("stores a hashed, 60-second single-use nonce and returns the handoff URL", async () => {
    vi.mocked(prisma.parentReport.findUnique).mockResolvedValue({
      id: "r1",
      token: "tok",
      studentId: "student-1",
      expiresAt: future,
      revokedAt: null,
    } as never);

    const res = await openParentReport(parent, "mentoring", "r1");
    expect(res.mode).toBe("web");
    const nonce = new URL(res.url!).searchParams.get("n")!;
    expect(res.url).toBe(`https://app.example.com/api/parent-handoff?n=${nonce}`);

    const arg = vi.mocked(prisma.authVerification.create).mock.calls[0][0];
    expect(arg.data.identifier).toBe(`parent-handoff:${hashToken(nonce)}`);
    expect(arg.data.identifier).not.toContain(nonce);
    expect(JSON.parse(arg.data.value)).toEqual({
      authUserId: "auth-1",
      kind: "mentoring",
      token: "tok",
      studentId: "student-1",
    });
    const ttl = (arg.data.expiresAt as Date).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(50_000);
    expect(ttl).toBeLessThanOrEqual(60_000);
  });

  it("opens online reports directly (no gate on that page)", async () => {
    vi.mocked(prisma.onlineParentReport.findUnique).mockResolvedValue({
      id: "o1",
      studentId: "student-1",
      token: "otok",
      status: "SENT",
    } as never);

    await expect(openParentReport(parent, "online", "o1")).resolves.toEqual({
      mode: "web",
      url: "https://app.example.com/r/online/otok",
    });
    expect(prisma.authVerification.create).not.toHaveBeenCalled();
  });

  it("does not open unsent online reports", async () => {
    vi.mocked(prisma.onlineParentReport.findUnique).mockResolvedValue({
      id: "o1",
      studentId: "student-1",
      token: "otok",
      status: "APPROVED",
    } as never);

    await expect(openParentReport(parent, "online", "o1")).rejects.toMatchObject({ status: 404 });
  });
});

describe("redeemParentHandoff", () => {
  const nonce = "a".repeat(43);
  const row = {
    id: "v1",
    value: JSON.stringify({ authUserId: "auth-1", kind: "mentoring", token: "tok", studentId: "student-1" }),
    expiresAt: new Date(Date.now() + 30_000),
  };

  function linkedAndValid() {
    vi.mocked(prisma.parentLink.findUnique).mockResolvedValue({ student: { status: "ACTIVE" } } as never);
    vi.mocked(prisma.parentReport.findUnique).mockResolvedValue({
      id: "r1",
      token: "tok",
      studentId: "student-1",
      expiresAt: future,
      revokedAt: null,
    } as never);
  }

  it("rejects malformed nonces without touching the database", async () => {
    await expect(redeemParentHandoff("../../etc")).resolves.toBeNull();
    await expect(redeemParentHandoff(null)).resolves.toBeNull();
    expect(prisma.authVerification.findFirst).not.toHaveBeenCalled();
  });

  it("consumes the nonce, re-checks the link and grants a ≤1h gate cookie", async () => {
    vi.mocked(prisma.authVerification.findFirst).mockResolvedValue(row as never);
    vi.mocked(prisma.authVerification.deleteMany).mockResolvedValue({ count: 1 });
    linkedAndValid();

    await expect(redeemParentHandoff(nonce)).resolves.toBe("/r/tok");
    expect(prisma.authVerification.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { identifier: `parent-handoff:${hashToken(nonce)}` } }),
    );
    expect(cookieSet).toHaveBeenCalledTimes(1);
    const cookie = cookieSet.mock.calls[0][0];
    expect(cookie.name).toMatch(/^mlgate_parent_/);
    expect(cookie.httpOnly).toBe(true);
    expect((cookie.expires as Date).getTime() - Date.now()).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it("fails when another request already consumed the nonce", async () => {
    vi.mocked(prisma.authVerification.findFirst).mockResolvedValue(row as never);
    vi.mocked(prisma.authVerification.deleteMany).mockResolvedValue({ count: 0 });
    linkedAndValid();

    await expect(redeemParentHandoff(nonce)).resolves.toBeNull();
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("fails for an expired nonce", async () => {
    vi.mocked(prisma.authVerification.findFirst).mockResolvedValue({ ...row, expiresAt: past } as never);
    vi.mocked(prisma.authVerification.deleteMany).mockResolvedValue({ count: 1 });
    linkedAndValid();

    await expect(redeemParentHandoff(nonce)).resolves.toBeNull();
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("fails when the parent link was removed or the student left", async () => {
    vi.mocked(prisma.authVerification.findFirst).mockResolvedValue(row as never);
    vi.mocked(prisma.authVerification.deleteMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.parentLink.findUnique).mockResolvedValue({ student: { status: "WITHDRAWN" } } as never);

    await expect(redeemParentHandoff(nonce)).resolves.toBeNull();
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("fails when the report was revoked after the nonce was issued", async () => {
    vi.mocked(prisma.authVerification.findFirst).mockResolvedValue(row as never);
    vi.mocked(prisma.authVerification.deleteMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.parentLink.findUnique).mockResolvedValue({ student: { status: "ACTIVE" } } as never);
    vi.mocked(prisma.parentReport.findUnique).mockResolvedValue({
      id: "r1",
      token: "tok",
      studentId: "student-1",
      expiresAt: future,
      revokedAt: past,
    } as never);

    await expect(redeemParentHandoff(nonce)).resolves.toBeNull();
    expect(cookieSet).not.toHaveBeenCalled();
  });
});

describe("listParentReports", () => {
  it("lists expired mentoring reports for linked parents but keeps the legacy list unchanged", async () => {
    vi.mocked(prisma.parentReport.findMany).mockResolvedValue([
      {
        id: "new",
        token: "t-new",
        createdAt: new Date(Date.now() - 60_000),
        expiresAt: future,
        revokedAt: null,
        customNote: "안내",
        mentoring: { actualDate: null, scheduledAt: new Date("2026-09-24T01:00:00Z"), mentor: { name: "김멘토" } },
      },
      {
        id: "old",
        token: "t-old",
        createdAt: new Date("2026-06-01T00:00:00Z"),
        expiresAt: new Date("2026-07-01T00:00:00Z"),
        revokedAt: null,
        customNote: null,
        mentoring: null,
      },
    ] as never);
    vi.mocked(prisma.monthlyReport.findMany).mockResolvedValue([]);
    vi.mocked(prisma.onlineParentReport.findMany).mockResolvedValue([]);
    vi.mocked(prisma.studyPlanReport.findMany).mockResolvedValue([]);
    vi.mocked(prisma.consultationReport.findMany).mockResolvedValue([]);

    const inbox = await listParentReports("student-1", "all");

    expect(inbox.reports.map((r) => [r.id, r.isNew, r.webAvailable])).toEqual([
      ["new", true, true],
      ["old", false, false],
    ]);
    expect(inbox.reports[0]).toMatchObject({ title: "9월 24일 멘토링 리포트", subtitle: "김멘토 멘토" });
    expect(inbox.counts).toMatchObject({ all: 2, mentoring: 2 });
    expect(inbox.newCount).toBe(1);
    // 구버전 앱 응답: 만료 전 리포트만
    expect(inbox.items.map((i) => i.id)).toEqual(["new"]);
    expect(inbox.items[0].url).toBe("https://app.example.com/r/t-new");
    // 새 목록에는 웹 토큰이 실리지 않는다
    expect(JSON.stringify(inbox.reports)).not.toContain("t-new");
  });

  it("queries only the requested kind", async () => {
    vi.mocked(prisma.monthlyReport.findMany).mockResolvedValue([]);
    await listParentReports("student-1", "monthly");
    expect(prisma.monthlyReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId: "student-1", sentAt: { not: null } },
      }),
    );
    expect(prisma.parentReport.findMany).not.toHaveBeenCalled();
  });
});

describe("parseMentoringNote", () => {
  it("splits the AI note into sections and keeps the preamble", () => {
    const parsed = parseMentoringNote(
      "어머님 안녕하세요.\r\n\r\n[오늘 멘토링 내용]\n- 수학 오답 정리\n\n[보완할 점]\n시간 관리\n[모르는 제목]\n그대로 둠",
    );
    expect(parsed).toEqual({
      preamble: "어머님 안녕하세요.",
      fields: { content: "- 수학 오답 정리", weaknesses: "시간 관리\n[모르는 제목]\n그대로 둠" },
    });
  });

  it("returns null for a free-form note", () => {
    expect(parseMentoringNote("이번 주도 수고 많았어요.")).toBeNull();
    expect(parseMentoringNote(null)).toBeNull();
  });
});

describe("getParentReportDetail", () => {
  const owned = { id: "r1", token: "secret-token", studentId: "student-1", revokedAt: null };

  function mentoringRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "r1",
      createdAt: new Date("2026-09-24T12:00:00Z"),
      customNote: null,
      studyPlanNote: null,
      studyPlanImages: [],
      student: { id: "student-1", name: "김학생", grade: "고2", school: "반송고" },
      mentoring: {
        // KST 2026-10-01 00:30 — UTC 로는 9월 30일
        scheduledAt: new Date("2026-09-30T15:30:00Z"),
        actualDate: null,
        actualStartTime: "14:05",
        actualEndTime: "15:10",
        status: "COMPLETED",
        content: "오늘 내용",
        improvements: null,
        weaknesses: "  ",
        nextGoals: "다음 목표",
        notes: null,
        mentor: { name: "박멘토" },
      },
      ...overrides,
    };
  }

  function emptyExtras() {
    vi.mocked(prisma.monthlyNote.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.meritDemerit.findMany).mockResolvedValue([]);
    vi.mocked(prisma.vocabTestScore.findMany).mockResolvedValue([]);
    vi.mocked(prisma.vocabAttempt.findMany).mockResolvedValue([]);
    vi.mocked(prisma.examScore.findMany).mockResolvedValue([]);
    vi.mocked(getStudentAnalytics).mockResolvedValue(null);
  }

  it("returns the full mentoring report even after the web link expired", async () => {
    vi.mocked(prisma.parentReport.findUnique).mockResolvedValue({ ...owned, expiresAt: past } as never);
    vi.mocked(prisma.parentReport.findUniqueOrThrow).mockResolvedValue(mentoringRow() as never);
    emptyExtras();

    const d = (await getParentReportDetail(parent, "mentoring", "r1", {
      ip: "1.2.3.4",
      ua: "app",
    })) as ParentMentoringReportDetail;

    expect(d.kind).toBe("mentoring");
    expect(d.student).toEqual({ name: "김학생", grade: "고2", school: "반송고" });
    expect(d.session).toEqual({
      date: "2026-10-01",
      hasMentoring: true,
      completed: true,
      time: "14:05 ~ 15:10",
      mentorName: "박멘토",
    });
    expect(d.message).toBeNull();
    // 빈 항목(공백뿐인 보완할 점 포함)은 빠진다
    expect(d.sections.map((s) => [s.key, s.title])).toEqual([
      ["content", "오늘 멘토링 내용"],
      ["nextGoals", "다음 멘토링 목표"],
    ]);
    expect(d.period).toEqual({ year: 2026, month: 10 });
    expect(d.vocab).toBeNull();
    expect(d.merits).toBeNull();
    expect(d.studyPlan).toBeNull();
    expect(d.scores).toBeNull();
    // 웹 토큰은 응답에 싣지 않는다
    expect(JSON.stringify(d)).not.toContain("secret-token");
    // 열람 기록 (fire-and-forget)
    await new Promise((r) => setTimeout(r, 0));
    expect(prisma.parentReport.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "r1" },
        data: expect.objectContaining({ lastAccessIp: "1.2.3.4", lastAccessUa: "app" }),
      }),
    );
  });

  it("hides revoked reports and reports of other children", async () => {
    vi.mocked(prisma.parentReport.findUnique).mockResolvedValue({ ...owned, revokedAt: past, expiresAt: future } as never);
    await expect(getParentReportDetail(parent, "mentoring", "r1")).rejects.toMatchObject({ status: 404 });

    vi.mocked(prisma.parentReport.findUnique).mockResolvedValue({
      ...owned,
      studentId: "someone-else",
      expiresAt: future,
    } as never);
    await expect(getParentReportDetail(parent, "mentoring", "r1")).rejects.toMatchObject({ status: 404 });
    expect(prisma.parentReport.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("splits an AI note into the same sections and uses its preamble as the mentor message", async () => {
    vi.mocked(prisma.parentReport.findUnique).mockResolvedValue({ ...owned, expiresAt: future } as never);
    vi.mocked(prisma.parentReport.findUniqueOrThrow).mockResolvedValue(
      mentoringRow({
        customNote: "안내드려요.\n[오늘 멘토링 내용]\nAI 내용\n[개선된 점]\n집중력",
        studyPlanNote: " 주간 계획 ",
        studyPlanImages: ["https://img/1.png", ""],
      }) as never,
    );
    emptyExtras();

    const d = (await getParentReportDetail(parent, "mentoring", "r1")) as ParentMentoringReportDetail;
    expect(d.message).toBe("안내드려요.");
    expect(d.sections).toEqual([
      { key: "content", title: "오늘 멘토링 내용", body: "AI 내용" },
      { key: "improvements", title: "개선된 점", body: "집중력" },
    ]);
    expect(d.studyPlan).toEqual({ note: "주간 계획", images: ["https://img/1.png"] });
  });

  it("uses a free-form note as the mentor message next to the mentoring record", async () => {
    vi.mocked(prisma.parentReport.findUnique).mockResolvedValue({ ...owned, expiresAt: future } as never);
    vi.mocked(prisma.parentReport.findUniqueOrThrow).mockResolvedValue(
      mentoringRow({ customNote: "이번 주도 수고했어요." }) as never,
    );
    emptyExtras();

    const d = (await getParentReportDetail(parent, "mentoring", "r1")) as ParentMentoringReportDetail;
    expect(d.message).toBe("이번 주도 수고했어요.");
    expect(d.sections.map((s) => s.key)).toEqual(["content", "nextGoals"]);
  });

  it("shows only report-visible notes and merits of the mentoring month (KST)", async () => {
    vi.mocked(prisma.parentReport.findUnique).mockResolvedValue({ ...owned, expiresAt: future } as never);
    vi.mocked(prisma.parentReport.findUniqueOrThrow).mockResolvedValue(mentoringRow() as never);
    emptyExtras();
    vi.mocked(prisma.monthlyNote.findFirst).mockResolvedValue({ content: " 성실해요 " } as never);
    vi.mocked(prisma.meritDemerit.findMany).mockResolvedValue([
      { id: "m1", date: new Date("2026-10-02T00:00:00Z"), type: "MERIT", points: 3, reason: "청소", category: "생활" },
      { id: "m2", date: new Date("2026-10-05T00:00:00Z"), type: "DEMERIT", points: 1, reason: "지각", category: null },
      { id: "m3", date: new Date("2026-10-06T00:00:00Z"), type: "MERIT", points: 2, reason: "봉사", category: null },
    ] as never);

    const d = (await getParentReportDetail(parent, "mentoring", "r1")) as ParentMentoringReportDetail;

    expect(prisma.monthlyNote.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId: "student-1", year: 2026, month: 10, visibleInReport: true },
      }),
    );
    expect(prisma.meritDemerit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          studentId: "student-1",
          date: { gte: new Date("2026-10-01T00:00:00Z"), lt: new Date("2026-11-01T00:00:00Z") },
          visibleInReport: true,
        },
      }),
    );
    expect(d.monthlyNote).toBe("성실해요");
    expect(d.merits?.merit).toEqual({ count: 2, points: 5 });
    expect(d.merits?.demerit).toEqual({ count: 1, points: 1 });
    expect(d.merits?.items[1]).toEqual({
      id: "m2",
      date: "2026-10-05",
      type: "DEMERIT",
      points: 1,
      reason: "지각",
      category: null,
    });
  });

  it("merges this month's paper and app vocab tests and builds the exam trend", async () => {
    vi.mocked(prisma.parentReport.findUnique).mockResolvedValue({ ...owned, expiresAt: future } as never);
    vi.mocked(prisma.parentReport.findUniqueOrThrow).mockResolvedValue(mentoringRow() as never);
    emptyExtras();
    vi.mocked(prisma.vocabTestScore.findMany).mockResolvedValue([
      { id: "p1", testDate: new Date("2026-10-06T00:00:00Z"), totalWords: 50, correctWords: 40, score: 80 },
    ] as never);
    vi.mocked(prisma.vocabAttempt.findMany).mockResolvedValue([
      // KST 10월 3일 08:00
      { id: "o1", submittedAt: new Date("2026-10-02T23:00:00Z"), score: 91.25, correctCount: 73, totalQuestions: 80 },
    ] as never);
    vi.mocked(prisma.examScore.findMany).mockResolvedValue([
      { examType: "OFFICIAL_MOCK", examName: "9월 모평", examDate: new Date("2026-09-03T00:00:00Z"), subject: "국어", grade: 2 },
      { examType: "OFFICIAL_MOCK", examName: "9월 모평", examDate: new Date("2026-09-03T00:00:00Z"), subject: "한국사", grade: 5 },
      { examType: "OFFICIAL_MOCK", examName: "9월 모평", examDate: new Date("2026-09-03T00:00:00Z"), subject: "수학", grade: 3 },
      { examType: "OFFICIAL_MOCK", examName: "6월 모평", examDate: new Date("2026-06-04T00:00:00Z"), subject: "국어", grade: 3 },
      { examType: "SCHOOL_EXAM", examName: "1학기 기말", examDate: new Date("2026-07-01T00:00:00Z"), subject: "수학", grade: null },
    ] as never);
    vi.mocked(getStudentAnalytics).mockResolvedValue({
      avgImprovement: 1,
      mentoringCount: 7,
      studyHours: 120,
      subjects: [
        { subject: "탐구", firstGrade: 4, latestGrade: 4, improvement: 0, firstExamName: "a", latestExamName: "b" },
        { subject: "국어", firstGrade: 3, latestGrade: 2, improvement: 1, firstExamName: "6월 모평", latestExamName: "9월 모평" },
      ],
    } as never);

    const d = (await getParentReportDetail(parent, "mentoring", "r1")) as ParentMentoringReportDetail;

    expect(prisma.vocabAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          submittedAt: { gte: new Date("2026-09-30T15:00:00Z"), lt: new Date("2026-10-31T15:00:00Z") },
        }),
      }),
    );
    expect(d.vocab).toEqual({
      count: 2,
      average: 85.7,
      latest: 80,
      points: [
        { id: "online:o1", source: "online", date: "2026-10-03", score: 91.3, correct: 73, total: 80 },
        { id: "paper:p1", source: "paper", date: "2026-10-06", score: 80, correct: 40, total: 50 },
      ],
    });
    expect(d.scores?.mentoringCount).toBe(7);
    // 오래된 → 최근, 등급 없는 시험 제외, 평균에서 한국사 제외
    expect(d.scores?.exams.map((e) => [e.name, e.averageGrade])).toEqual([
      ["6월 모평", 3],
      ["9월 모평", 2.5],
    ]);
    expect(d.scores?.exams[1].grades).toEqual({ 국어: 2, 한국사: 5, 수학: 3 });
    expect(d.scores?.subjects.map((s) => s.subject)).toEqual(["국어", "탐구"]);
  });

  it("returns the online report body and does not open unsent ones", async () => {
    vi.mocked(prisma.onlineParentReport.findUnique).mockResolvedValue({
      id: "o1",
      studentId: "student-1",
      token: "otok",
      status: "SENT",
    } as never);
    vi.mocked(prisma.onlineParentReport.findUniqueOrThrow).mockResolvedValue({
      id: "o1",
      type: "WEEKLY",
      periodStart: new Date("2026-09-14T00:00:00Z"),
      periodEnd: new Date("2026-09-20T00:00:00Z"),
      sentAt: new Date("2026-09-21T01:00:00Z"),
      content: { markdown: "## 이번 주\n잘했어요" },
      student: { name: "김학생", grade: "고2", school: null },
    } as never);

    const d = (await getParentReportDetail(parent, "online", "o1")) as ParentOnlineReportDetail;
    expect(d).toMatchObject({
      kind: "online",
      typeLabel: "주간",
      title: "주간 학습 보고서",
      periodStart: "2026-09-14",
      periodEnd: "2026-09-20",
      markdown: "## 이번 주\n잘했어요",
      feedbackEnabled: true,
    });
    expect(JSON.stringify(d)).not.toContain("otok");

    vi.mocked(prisma.onlineParentReport.findUnique).mockResolvedValue({
      id: "o1",
      studentId: "student-1",
      token: "otok",
      status: "APPROVED",
    } as never);
    await expect(getParentReportDetail(parent, "online", "o1")).rejects.toMatchObject({ status: 404 });
  });

  it("returns study plan images and consultation text", async () => {
    vi.mocked(prisma.studyPlanReport.findUnique).mockResolvedValue({ ...owned, expiresAt: past } as never);
    vi.mocked(prisma.studyPlanReport.findUniqueOrThrow).mockResolvedValue({
      id: "r1",
      createdAt: new Date("2026-09-24T00:00:00Z"),
      images: ["https://img/a.png"],
      student: { name: "김학생", grade: "고2", school: "반송고" },
    } as never);
    const plan = (await getParentReportDetail(parent, "study-plan", "r1")) as ParentStudyPlanReportDetail;
    expect(plan).toMatchObject({ kind: "study-plan", images: ["https://img/a.png"] });

    vi.mocked(prisma.consultationReport.findUnique).mockResolvedValue({
      id: "c1",
      token: "ctok",
      expiresAt: past,
      revokedAt: null,
      consultation: { studentId: "student-1" },
    } as never);
    vi.mocked(prisma.consultationReport.findUniqueOrThrow).mockResolvedValue({
      id: "c1",
      createdAt: new Date("2026-09-24T00:00:00Z"),
      content: " 상담 내용 \n",
      recipientName: "김학생 어머님",
      consultation: {
        actualDate: null,
        scheduledAt: new Date("2026-09-22T05:00:00Z"),
        student: { name: "김학생", grade: "고2", school: null },
      },
    } as never);
    const c = (await getParentReportDetail(parent, "consultation", "c1")) as ParentConsultationReportDetail;
    expect(c).toMatchObject({
      kind: "consultation",
      recipientName: "김학생 어머님",
      consultedAt: "2026-09-22T05:00:00.000Z",
      content: "상담 내용",
    });
  });
});

describe("monthly reports without a share link", () => {
  it("stay reachable in the app (no share token needed) but never get a web handoff", async () => {
    vi.mocked(prisma.monthlyReport.findUnique).mockResolvedValue({
      id: "m1",
      studentId: "student-1",
      shareToken: null,
      sentAt: past,
    } as never);
    await expect(openParentReport(parent, "monthly", "m1")).resolves.toEqual({ mode: "native", url: null });
    expect(prisma.authVerification.create).not.toHaveBeenCalled();
  });

  it("are hidden until sent", async () => {
    vi.mocked(prisma.monthlyReport.findUnique).mockResolvedValue({
      id: "m1",
      studentId: "student-1",
      shareToken: "stok",
      sentAt: null,
    } as never);
    await expect(openParentReport(parent, "monthly", "m1")).rejects.toMatchObject({ status: 404 });
  });
});
