import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/slack", () => ({ notifySlack: vi.fn() }));
vi.mock("@/lib/student-auth", () => ({ issueMagicLink: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    vocabAttempt: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    vocabAttemptItem: { findMany: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    vocabExam: { create: vi.fn() },
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { finalizeVocabAttempt, createRetakeFromAttempt } from "@/actions/vocab-online";

const staff = { user: { id: "u1", role: "DIRECTOR", name: "원장" } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(staff as never);
});

describe("finalizeVocabAttempt", () => {
  it("computes percentage score and marks blanks wrong", async () => {
    const startedAt = new Date(Date.now() - 60_000);
    vi.mocked(prisma.vocabAttempt.findUnique).mockResolvedValue({
      id: "a1",
      status: "IN_PROGRESS",
      startedAt,
      score: null,
      correctCount: 0,
      totalQuestions: 4,
      exam: { perQuestionSeconds: 10, title: "T" },
    } as never);
    vi.mocked(prisma.vocabAttemptItem.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.vocabAttemptItem.findMany).mockResolvedValue([
      { isCorrect: true, timeMs: 3000 },
      { isCorrect: true, timeMs: 5000 },
      { isCorrect: true, timeMs: 2000 },
      { isCorrect: false, timeMs: 0 },
    ] as never);
    vi.mocked(prisma.vocabAttempt.update).mockResolvedValue({} as never);

    const res = await finalizeVocabAttempt("tok");
    expect(res).toEqual({ score: 75, correctCount: 3, totalQuestions: 4 });
    // unanswered items zeroed before counting
    expect(prisma.vocabAttemptItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { attemptId: "a1", answeredAt: null } })
    );
    expect(prisma.vocabAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SUBMITTED", score: 75, correctCount: 3 }) })
    );
  });

  it("is idempotent once SUBMITTED", async () => {
    vi.mocked(prisma.vocabAttempt.findUnique).mockResolvedValue({
      id: "a1",
      status: "SUBMITTED",
      score: 90,
      correctCount: 9,
      totalQuestions: 10,
      exam: { perQuestionSeconds: 10, title: "T" },
    } as never);
    const res = await finalizeVocabAttempt("tok");
    expect(res).toEqual({ score: 90, correctCount: 9, totalQuestions: 10 });
    expect(prisma.vocabAttempt.update).not.toHaveBeenCalled();
  });
});

describe("createRetakeFromAttempt", () => {
  it("builds a new exam from the distinct wrong entry ids and assigns it to the same student", async () => {
    vi.mocked(prisma.vocabAttempt.findUnique).mockResolvedValue({
      id: "a1",
      status: "SUBMITTED",
      studentId: "s1",
      exam: { id: "e1", title: "Day 12", bookId: "b1", direction: "EN_TO_KO", perQuestionSeconds: 10, shuffle: true },
      items: [
        { entryId: "x", isCorrect: false, order: 0 },
        { entryId: "y", isCorrect: false, order: 1 },
        { entryId: "x", isCorrect: false, order: 2 },
      ],
    } as never);
    vi.mocked(prisma.vocabExam.create).mockResolvedValue({ id: "e2" } as never);
    vi.mocked(prisma.vocabAttempt.create).mockResolvedValue({ token: "newtok" } as never);

    const res = await createRetakeFromAttempt("a1");
    expect(res).toEqual({ examId: "e2", token: "newtok" });
    const examCreateArg = vi.mocked(prisma.vocabExam.create).mock.calls[0][0] as { data: Record<string, unknown> };
    expect(examCreateArg.data).toMatchObject({
      bookId: "b1",
      entryIds: ["x", "y"],
      questionCount: 2,
      retakeOfId: "e1",
      title: "재시험: Day 12",
    });
    expect(prisma.vocabAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ examId: "e2", studentId: "s1", totalQuestions: 2 }) })
    );
  });

  it("throws if there are no wrong answers", async () => {
    vi.mocked(prisma.vocabAttempt.findUnique).mockResolvedValue({
      id: "a1",
      status: "SUBMITTED",
      studentId: "s1",
      exam: { id: "e1", title: "T", bookId: "b1", direction: "EN_TO_KO", perQuestionSeconds: 10, shuffle: true },
      items: [],
    } as never);
    await expect(createRetakeFromAttempt("a1")).rejects.toThrow();
  });
});
