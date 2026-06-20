import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    performanceTask: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    taskFeedback: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    taskResult: {
      upsert: vi.fn(),
    },
    taskSubmission: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock("@/lib/slack", () => ({ notifySlack: vi.fn() }));

import { prisma } from "@/lib/prisma";
import {
  createMobileTaskFeedback,
  submitMobileStudentTask,
} from "@/lib/mobile-tasks";

const file = {
  mimeType: "application/pdf",
  name: "report.pdf",
  sizeBytes: 2048,
  url: "https://example.public.blob.vercel-storage.com/report.pdf",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("submitMobileStudentTask", () => {
  it("creates the first submission and moves the task to SUBMITTED", async () => {
    vi.mocked(prisma.performanceTask.findFirst).mockResolvedValue({
      id: "task-1",
      status: "OPEN",
      subject: "국어",
      title: "독서 보고서",
    } as never);
    vi.mocked(prisma.taskSubmission.findFirst).mockResolvedValue(null);

    const result = await submitMobileStudentTask(
      { id: "student-1", name: "김학생" },
      "task-1",
      { files: [file], note: "초안 제출" },
    );

    expect(result).toEqual({ ok: true, version: 1 });
    expect(prisma.taskSubmission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          studentId: "student-1",
          taskId: "task-1",
          version: 1,
        }),
      }),
    );
    expect(prisma.performanceTask.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { status: "SUBMITTED" },
    });
  });

  it("creates a new version after feedback exists", async () => {
    vi.mocked(prisma.performanceTask.findFirst).mockResolvedValue({
      id: "task-1",
      status: "NEEDS_REVISION",
      subject: "국어",
      title: "독서 보고서",
    } as never);
    vi.mocked(prisma.taskSubmission.findFirst).mockResolvedValue({
      _count: { feedbacks: 1 },
      id: "submission-1",
      version: 1,
    } as never);

    const result = await submitMobileStudentTask(
      { id: "student-1", name: "김학생" },
      "task-1",
      { files: [file] },
    );

    expect(result.version).toBe(2);
    expect(prisma.taskSubmission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ version: 2 }),
      }),
    );
  });
});

describe("createMobileTaskFeedback", () => {
  it("rejects feedback from a manager mentor", async () => {
    await expect(
      createMobileTaskFeedback(
        { id: "manager-1", role: "MANAGER_MENTOR" },
        "submission-1",
        { content: "확인했습니다", status: "COMMENT" },
      ),
    ).rejects.toMatchObject({
      message: "수행평가 피드백 권한이 필요합니다",
      status: 403,
    });
  });

  it("approves the latest submission and finalizes its files", async () => {
    vi.mocked(prisma.taskSubmission.findUnique).mockResolvedValue({
      files: [file],
      id: "submission-1",
      task: {
        id: "task-1",
        status: "SUBMITTED",
        studentId: "student-1",
        submissions: [{ id: "submission-1" }],
      },
    } as never);

    await createMobileTaskFeedback(
      { id: "consultant-1", role: "CONSULTANT" },
      "submission-1",
      { content: "최종 승인합니다", status: "APPROVED" },
    );

    expect(prisma.taskFeedback.create).toHaveBeenCalled();
    expect(prisma.taskResult.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          studentId: "student-1",
          taskId: "task-1",
        }),
      }),
    );
    expect(prisma.performanceTask.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { status: "DONE" },
    });
  });

  it("rejects approval for an older submission version", async () => {
    vi.mocked(prisma.taskSubmission.findUnique).mockResolvedValue({
      files: [file],
      id: "submission-1",
      task: {
        id: "task-1",
        status: "SUBMITTED",
        studentId: "student-1",
        submissions: [{ id: "submission-2" }],
      },
    } as never);

    await expect(
      createMobileTaskFeedback(
        { id: "consultant-1", role: "CONSULTANT" },
        "submission-1",
        { content: "최종 승인합니다", status: "APPROVED" },
      ),
    ).rejects.toMatchObject({
      message: "최신 제출물에만 수정 요청 또는 승인을 할 수 있습니다",
      status: 409,
    });
    expect(prisma.taskFeedback.create).not.toHaveBeenCalled();
  });
});
