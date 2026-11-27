import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  reportAiJob: { findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  monthlyReport: { update: vi.fn() },
  parentReport: { update: vi.fn(), findUnique: vi.fn() },
  student: { findMany: vi.fn() },
  aiTransferLog: { create: vi.fn() },
}));
const sent = vi.hoisted(() => ({ body: null as null | { messages: { content: string }[] } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("groq-sdk", () => ({
  default: class {
    chat = {
      completions: {
        create: async (body: never) => {
          sent.body = body;
          return { choices: [{ message: { content: "학생A는 성실했어요." } }] };
        },
      },
    };
  },
}));

import { applyReviewedAiJob, processQueuedAiJobs } from "../report-ai-queue";

beforeEach(() => {
  vi.clearAllMocks();
  db.student.findMany.mockResolvedValue([{ name: "정도현" }]);
  db.aiTransferLog.create.mockResolvedValue({});
  db.reportAiJob.updateMany.mockResolvedValue({ count: 1 });
});

describe("리포트 AI 예약", () => {
  it("이름·연락처·민감 문장을 빼고 보내고, 결과는 확인 대기로만 둔다", async () => {
    db.reportAiJob.findFirst
      .mockResolvedValueOnce({
        id: "j1",
        type: "MONTHLY_SUMMARY",
        targetId: "m1",
        studentName: "서하윤",
        systemPrompt: "서하윤 학생 종합의견",
        userPrompt: "서하윤은 정도현과 공부함. 우울증으로 병원 다님. 010-1234-5678",
      })
      .mockResolvedValueOnce(null);

    expect(await processQueuedAiJobs()).toEqual({ made: 1, failed: 0 });
    expect(JSON.stringify(sent.body)).not.toMatch(/서하윤|하윤|정도현|병원|010-1234/);
    expect(db.reportAiJob.updateMany.mock.calls[0][0].data).toMatchObject({
      status: "REVIEW",
      resultText: "서하윤은 성실했어요.",
      systemPrompt: "",
      userPrompt: "",
    });
    expect(db.monthlyReport.update).not.toHaveBeenCalled();
    expect(db.aiTransferLog.create.mock.calls[0][0].data).toMatchObject({ ok: true, droppedSensitive: 1 });
  });

  it("전송 이력을 못 남겨도 업무는 이어진다", async () => {
    db.aiTransferLog.create.mockRejectedValue(new Error("표 없음"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    db.reportAiJob.findFirst
      .mockResolvedValueOnce({ id: "j1", type: "MONTHLY_SUMMARY", targetId: "m1", studentName: "서하윤", systemPrompt: "s", userPrompt: "u" })
      .mockResolvedValueOnce(null);
    expect(await processQueuedAiJobs()).toEqual({ made: 1, failed: 0 });
  });

  it("확인 대기가 아니면 반영하지 않는다", async () => {
    for (const status of ["QUEUED", "DONE", "FAILED"]) {
      db.reportAiJob.findUnique.mockResolvedValue({ id: "j1", type: "MONTHLY_SUMMARY", targetId: "m1", status, resultText: "글" });
      expect((await applyReviewedAiJob("j1")).ok).toBe(false);
    }
    expect(db.monthlyReport.update).not.toHaveBeenCalled();
  });

  it("두 사람이 동시에 눌러도 한 번만 반영한다", async () => {
    db.reportAiJob.findUnique.mockResolvedValue({ id: "j1", type: "MONTHLY_SUMMARY", targetId: "m1", status: "REVIEW", resultText: "글" });
    db.reportAiJob.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const [a, b] = await Promise.all([applyReviewedAiJob("j1"), applyReviewedAiJob("j1")]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(db.monthlyReport.update).toHaveBeenCalledTimes(1);
  });
});
