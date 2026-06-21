import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    authUser: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    devicePushToken: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    performanceTask: {
      findUnique: vi.fn(),
    },
    pushNotificationReceipt: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    student: {
      findUnique: vi.fn(),
    },
    studentQuestion: {
      findUnique: vi.fn(),
    },
    taskSubmission: {
      findUnique: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  notifyAssignedStaffOfQuestion,
  processPendingPushReceipts,
  registerMobilePushToken,
  sendMobilePush,
} from "@/lib/mobile-push";

const token = "ExponentPushToken[test_token-1]";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("registerMobilePushToken", () => {
  it("upserts the device and notification preferences", async () => {
    await registerMobilePushToken("auth-1", {
      appVersion: "1.0.0",
      deviceName: "iPhone",
      enabled: true,
      expoPushToken: token,
      platform: "IOS",
      preferences: {
        answers: false,
        mentoring: true,
        tasks: true,
      },
      projectId: "123e4567-e89b-12d3-a456-426614174000",
    });

    expect(prisma.devicePushToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token },
        create: expect.objectContaining({
          authUserId: "auth-1",
          questionsEnabled: false,
          tasksEnabled: true,
        }),
        update: expect.objectContaining({
          authUserId: "auth-1",
          questionsEnabled: false,
        }),
      }),
    );
  });
});

describe("sendMobilePush", () => {
  it("sends project batches and stores Expo receipt IDs", async () => {
    vi.mocked(prisma.devicePushToken.findMany).mockResolvedValue([
      { id: "device-1", projectId: "project-1", token },
    ] as never);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ data: [{ id: "receipt-1", status: "ok" }] }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendMobilePush({
        authUserIds: ["auth-1", "auth-1"],
        body: "새 질문이 있습니다.",
        category: "QUESTION",
        data: { questionId: "question-1", url: "/(staff)/qna" },
        title: "새 학생 질문",
      }),
    ).resolves.toEqual({ sent: 1 });

    expect(prisma.devicePushToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          authUserId: { in: ["auth-1"] },
          questionsEnabled: true,
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(prisma.pushNotificationReceipt.createMany).toHaveBeenCalledWith({
      data: [
        {
          category: "QUESTION",
          devicePushTokenId: "device-1",
          expoReceiptId: "receipt-1",
        },
      ],
      skipDuplicates: true,
    });
  });

  it("disables a token rejected as DeviceNotRegistered", async () => {
    vi.mocked(prisma.devicePushToken.findMany).mockResolvedValue([
      { id: "device-1", projectId: "project-1", token },
    ] as never);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              {
                details: { error: "DeviceNotRegistered" },
                status: "error",
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    await sendMobilePush({
      authUserIds: ["auth-1"],
      body: "새 피드백이 있습니다.",
      category: "TASK",
      data: { taskId: "task-1", url: "/student-tasks" },
      title: "수행평가 피드백",
    });

    expect(prisma.devicePushToken.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["device-1"] } },
      data: { enabled: false },
    });
  });
});

describe("notifyAssignedStaffOfQuestion", () => {
  it("falls back to active supervisors when a student has no assignee", async () => {
    vi.mocked(prisma.studentQuestion.findUnique).mockResolvedValue({
      claimedById: null,
      student: { id: "student-1", name: "김학생" },
      title: "수학 질문",
    } as never);
    vi.mocked(prisma.student.findUnique).mockResolvedValue({
      assignedConsultantId: null,
      assignedMentorId: null,
      assignedStaffId: null,
      mentorId: null,
    } as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: "director-1" },
    ] as never);
    vi.mocked(prisma.authUser.findMany).mockResolvedValue([
      { id: "auth-director-1" },
    ] as never);
    vi.mocked(prisma.devicePushToken.findMany).mockResolvedValue([]);

    await notifyAssignedStaffOfQuestion({ questionId: "question-1" });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: { in: ["SUPER_ADMIN", "DIRECTOR", "HEAD_MENTOR"] },
          status: "ACTIVE",
        }),
      }),
    );
    expect(prisma.devicePushToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          authUserId: { in: ["auth-director-1"] },
        }),
      }),
    );
  });
});

describe("processPendingPushReceipts", () => {
  it("marks failed receipts and disables invalid devices", async () => {
    const now = new Date("2026-06-21T03:00:00.000Z");
    vi.mocked(prisma.pushNotificationReceipt.findMany).mockResolvedValue([
      {
        devicePushTokenId: "device-1",
        expoReceiptId: "receipt-1",
        id: "record-1",
      },
    ] as never);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              "receipt-1": {
                details: { error: "DeviceNotRegistered" },
                message: "The device cannot receive push notifications.",
                status: "error",
              },
            },
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(processPendingPushReceipts(now)).resolves.toEqual({
      checked: 1,
      delivered: 0,
      failed: 1,
    });
    expect(prisma.pushNotificationReceipt.update).toHaveBeenCalledWith({
      where: { id: "record-1" },
      data: {
        checkedAt: now,
        errorCode: "DeviceNotRegistered",
        errorMessage: "The device cannot receive push notifications.",
        status: "FAILED",
      },
    });
    expect(prisma.devicePushToken.update).toHaveBeenCalledWith({
      where: { id: "device-1" },
      data: { enabled: false },
    });
  });
});
