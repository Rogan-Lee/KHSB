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
    messageLog: {
      createMany: vi.fn(),
    },
    parentLink: {
      findMany: vi.fn(),
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
  notifyParentsOfStudent,
  notifyStudentOfAnswer,
  processPendingPushReceipts,
  queueParentAttendancePush,
  queueParentDemeritPush,
  queueStaffAlert,
  registerMobilePushToken,
  sendMobilePush,
  STAFF_PUSH_ROUTES,
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
    // 운영진 알림 같은 log 없는 발송은 학생별 발송 이력에 남지 않는다
    expect(prisma.messageLog.createMany).not.toHaveBeenCalled();
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

describe("queueStaffAlert", () => {
  const okExpo = () =>
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: "r-1", status: "ok" }] }), { status: 200 })),
    );
  const pushTargets = () =>
    vi.mocked(prisma.devicePushToken.findMany).mock.calls.map(
      ([arg]) => (arg as { where: { authUserId: { in: string[] } } }).where.authUserId.in,
    );
  const assignedMentor = () =>
    vi.mocked(prisma.student.findUnique).mockResolvedValue({
      assignedConsultantId: null,
      assignedMentorId: "mentor-1",
      assignedStaffId: null,
      mentorId: null,
    } as never);

  it("sends a student's request to the assigned staff (no fallback once delivered)", async () => {
    assignedMentor();
    vi.mocked(prisma.authUser.findMany).mockResolvedValue([{ id: "auth-mentor-1" }] as never);
    vi.mocked(prisma.devicePushToken.findMany).mockResolvedValue([
      { id: "device-1", projectId: "project-1", token },
    ] as never);
    okExpo();

    queueStaffAlert({ studentId: "student-1", title: "새 쪽잠 신청", body: "김학생", url: STAFF_PUSH_ROUTES.approvals });

    await vi.waitFor(() => expect(prisma.pushNotificationReceipt.createMany).toHaveBeenCalled());
    expect(pushTargets()).toEqual([["auth-mentor-1"]]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("falls back to supervisors when the assigned staff has no enabled device", async () => {
    assignedMentor();
    vi.mocked(prisma.authUser.findMany)
      .mockResolvedValueOnce([{ id: "auth-mentor-1" }] as never) // 담당 멘토
      .mockResolvedValueOnce([{ id: "auth-director-1" }] as never); // 원장급
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: "director-1" }] as never);
    vi.mocked(prisma.devicePushToken.findMany).mockResolvedValue([]);

    queueStaffAlert({ studentId: "student-1", title: "새 쪽잠 신청", body: "김학생", url: STAFF_PUSH_ROUTES.approvals });

    await vi.waitFor(() => expect(pushTargets()).toEqual([["auth-mentor-1"], ["auth-director-1"]]));
  });

  it("skips staff who are no longer active", async () => {
    assignedMentor();
    vi.mocked(prisma.authUser.findMany).mockResolvedValue([]);
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);

    queueStaffAlert({ studentId: "student-1", title: "t", body: "b", url: STAFF_PUSH_ROUTES.home });

    await vi.waitFor(() => expect(prisma.user.findMany).toHaveBeenCalled());
    expect(prisma.authUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { appUserId: { in: ["mentor-1"] }, appUser: { status: "ACTIVE" } } }),
    );
  });

  it("sends a student chat message only to that chat's staff", async () => {
    vi.mocked(prisma.authUser.findMany).mockResolvedValue([{ id: "auth-staff-7" }] as never);
    vi.mocked(prisma.devicePushToken.findMany).mockResolvedValue([
      { id: "device-7", projectId: "project-1", token },
    ] as never);
    okExpo();

    queueStaffAlert({
      studentId: "student-1",
      staffUserIds: ["staff-7"],
      title: "김학생 학생 메시지",
      body: "안녕하세요",
      url: STAFF_PUSH_ROUTES.inbox,
      data: { chatId: "chat-1" },
    });

    await vi.waitFor(() => expect(prisma.pushNotificationReceipt.createMany).toHaveBeenCalled());
    expect(pushTargets()).toEqual([["auth-staff-7"]]);
    expect(prisma.student.findUnique).not.toHaveBeenCalled();
  });

  it("sends a waitlist entry (no student) to supervisors", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: "director-1" }] as never);
    vi.mocked(prisma.authUser.findMany).mockResolvedValue([{ id: "auth-director-1" }] as never);
    vi.mocked(prisma.devicePushToken.findMany).mockResolvedValue([]);

    queueStaffAlert({ studentId: null, title: "새 입회 문의", body: "홍길동", url: STAFF_PUSH_ROUTES.home });

    await vi.waitFor(() => expect(pushTargets()[0]).toEqual(["auth-director-1"]));
    expect(prisma.student.findUnique).not.toHaveBeenCalled();
  });
});

describe("notifyParentsOfStudent", () => {
  const message = {
    body: "김학생 학생이 18:02에 입실했어요.",
    data: { kind: "attendance", url: "/(parent)/(tabs)" },
    title: "입실 알림",
  };

  it("sends a SYSTEM push to every linked parent with the tap route", async () => {
    vi.mocked(prisma.parentLink.findMany).mockResolvedValue([
      { authUserId: "parent-1" },
      { authUserId: "parent-2" },
    ] as never);
    vi.mocked(prisma.devicePushToken.findMany).mockResolvedValue([
      { id: "device-1", projectId: "project-1", token },
    ] as never);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ data: [{ id: "receipt-9", status: "ok" }] }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(notifyParentsOfStudent("student-1", message)).resolves.toEqual({ sent: 1 });

    expect(prisma.parentLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId: "student-1", student: { status: "ACTIVE" } },
      }),
    );
    // SYSTEM 카테고리 — 세부 토글 없이 기기 알림(enabled)만 본다
    expect(prisma.devicePushToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { authUserId: { in: ["parent-1", "parent-2"] }, enabled: true },
      }),
    );
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(payload[0]).toMatchObject({
      data: {
        audience: "parent",
        kind: "attendance",
        studentId: "student-1",
        url: "/(parent)/(tabs)",
      },
      title: "입실 알림",
    });
  });

  it("does nothing when the student has no linked parent", async () => {
    vi.mocked(prisma.parentLink.findMany).mockResolvedValue([]);
    await expect(notifyParentsOfStudent("student-1", message)).resolves.toEqual({ sent: 0 });
    expect(prisma.devicePushToken.findMany).not.toHaveBeenCalled();
  });

  it("never throws into business logic", async () => {
    vi.mocked(prisma.parentLink.findMany).mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(notifyParentsOfStudent("student-1", message)).resolves.toEqual({ sent: 0 });
    spy.mockRestore();
  });

  it("skips attendance pushes for stale (corrected) records", () => {
    queueParentAttendancePush("student-1", "CHECK_IN", new Date(Date.now() - 5 * 60 * 60 * 1000));
    expect(prisma.student.findUnique).not.toHaveBeenCalled();
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

describe("학생별 발송 이력 (MessageLog)", () => {
  const expoTickets = (tickets: unknown[]) =>
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: tickets }), { status: 200 })));
  const loggedRows = () => vi.mocked(prisma.messageLog.createMany).mock.calls.flatMap(([arg]) => (arg as { data: unknown[] }).data);
  const twoParents = () => {
    vi.mocked(prisma.parentLink.findMany).mockResolvedValue([{ authUserId: "parent-1" }, { authUserId: "parent-2" }] as never);
    vi.mocked(prisma.devicePushToken.findMany).mockResolvedValue([
      { authUserId: "parent-1", id: "device-1", projectId: "project-1", token },
      { authUserId: "parent-2", id: "device-2", projectId: "project-1", token },
      { authUserId: "parent-2", id: "device-3", projectId: "project-1", token },
    ] as never);
    vi.mocked(prisma.authUser.findMany).mockResolvedValue([
      { id: "parent-1", name: "학부모일", studentId: null },
      { id: "parent-2", name: " ", studentId: null },
    ] as never);
  };
  const message = { title: "입실 알림", body: "학생이 18:02에 입실했어요.", data: { url: "/(parent)/(tabs)" }, logType: "ATTENDANCE" as const };

  it("받은 계정마다 한 줄 — 기기 하나라도 접수되면 SENT, 모두 거절이면 FAILED", async () => {
    twoParents();
    expoTickets([
      { id: "r-1", status: "ok" },
      { status: "error", details: { error: "DeviceNotRegistered" } },
      { status: "error", message: "rate limited" },
    ]);

    await expect(notifyParentsOfStudent("student-1", message)).resolves.toEqual({ sent: 1 });

    expect(loggedRows()).toEqual([
      {
        studentId: "student-1",
        type: "ATTENDANCE",
        recipient: "앱 알림 · 학부모 학부모일",
        recipientName: "학부모일",
        content: "입실 알림\n학생이 18:02에 입실했어요.",
        status: "SENT",
        errorMsg: null,
      },
      {
        studentId: "student-1",
        type: "ATTENDANCE",
        recipient: "앱 알림 · 학부모 parent-2", // 이름이 비면 계정 id
        recipientName: null,
        content: "입실 알림\n학생이 18:02에 입실했어요.",
        status: "FAILED",
        errorMsg: "rate limited",
      },
    ]);
  });

  it("기본 종류는 CUSTOM, 같은 계정의 다른 기기가 성공하면 SENT", async () => {
    twoParents();
    expoTickets([
      { status: "error", details: { error: "DeviceNotRegistered" } },
      { status: "error", details: { error: "MessageRateExceeded" } },
      { id: "r-3", status: "ok" },
    ]);
    await notifyParentsOfStudent("student-1", { ...message, logType: undefined });

    expect(loggedRows()).toEqual([
      expect.objectContaining({ type: "CUSTOM", status: "FAILED", errorMsg: "DeviceNotRegistered" }),
      expect.objectContaining({ type: "CUSTOM", status: "SENT", errorMsg: null }),
    ]);
  });

  it("Expo 요청이 실패하면 FAILED 로 남기고, 학부모 알림은 여전히 던지지 않는다", async () => {
    twoParents();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad", { status: 400 })));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(notifyParentsOfStudent("student-1", message)).resolves.toEqual({ sent: 0 });

    expect(loggedRows()).toEqual([
      expect.objectContaining({ recipient: "앱 알림 · 학부모 학부모일", status: "FAILED", errorMsg: "Expo 푸시 요청 실패: 400" }),
      expect.objectContaining({ recipient: "앱 알림 · 학부모 parent-2", status: "FAILED", errorMsg: "Expo 푸시 요청 실패: 400" }),
    ]);
    spy.mockRestore();
  });

  it("기록이 실패해도 발송 결과는 그대로다", async () => {
    twoParents();
    expoTickets([{ id: "r-1", status: "ok" }, { id: "r-2", status: "ok" }, { id: "r-3", status: "ok" }]);
    vi.mocked(prisma.messageLog.createMany).mockRejectedValueOnce(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(notifyParentsOfStudent("student-1", message)).resolves.toEqual({ sent: 3 });

    expect(prisma.pushNotificationReceipt.createMany).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith("[mobile-push:log]", expect.any(Error));
    spy.mockRestore();
  });

  it("기기가 없으면 보낸 게 없으니 남기지 않는다", async () => {
    vi.mocked(prisma.parentLink.findMany).mockResolvedValue([{ authUserId: "parent-1" }] as never);
    vi.mocked(prisma.devicePushToken.findMany).mockResolvedValue([]);

    await notifyParentsOfStudent("student-1", message);

    expect(prisma.messageLog.createMany).not.toHaveBeenCalled();
  });

  it("학생 본인에게 간 알림은 '학생'으로 남는다 (질문 답변)", async () => {
    vi.mocked(prisma.studentQuestion.findUnique).mockResolvedValue({ studentId: "student-1", title: "수학" } as never);
    vi.mocked(prisma.authUser.findUnique).mockResolvedValue({ id: "auth-student-1" } as never);
    vi.mocked(prisma.devicePushToken.findMany).mockResolvedValue([
      { authUserId: "auth-student-1", id: "device-1", projectId: "project-1", token },
    ] as never);
    vi.mocked(prisma.authUser.findMany).mockResolvedValue([
      { id: "auth-student-1", name: "김학생", studentId: "student-1" },
    ] as never);
    expoTickets([{ id: "r-1", status: "ok" }]);

    await notifyStudentOfAnswer({ questionId: "question-1" });

    expect(loggedRows()).toEqual([
      expect.objectContaining({ studentId: "student-1", type: "CUSTOM", recipient: "앱 알림 · 학생 김학생", status: "SENT" }),
    ]);
  });

  it("벌점 알림은 MERIT_DEMERIT, 운영진 알림은 남기지 않는다", async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue({ name: "김학생" } as never);
    vi.mocked(prisma.parentLink.findMany).mockResolvedValue([{ authUserId: "parent-1" }] as never);
    vi.mocked(prisma.devicePushToken.findMany).mockResolvedValue([
      { authUserId: "parent-1", id: "device-1", projectId: "project-1", token },
    ] as never);
    vi.mocked(prisma.authUser.findMany).mockResolvedValue([{ id: "parent-1", name: "학부모일", studentId: null }] as never);
    expoTickets([{ id: "r-1", status: "ok" }]);

    queueParentDemeritPush({ studentId: "student-1", type: "DEMERIT", points: 2, reason: "지각" });
    await vi.waitFor(() => expect(prisma.messageLog.createMany).toHaveBeenCalled());
    expect(loggedRows()).toEqual([expect.objectContaining({ type: "MERIT_DEMERIT", status: "SENT" })]);

    vi.clearAllMocks();
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: "director-1" }] as never);
    vi.mocked(prisma.authUser.findMany).mockResolvedValue([{ id: "auth-director-1" }] as never);
    vi.mocked(prisma.devicePushToken.findMany).mockResolvedValue([
      { authUserId: "auth-director-1", id: "device-9", projectId: "project-1", token },
    ] as never);
    expoTickets([{ id: "r-9", status: "ok" }]);

    queueStaffAlert({ studentId: null, title: "새 입회 문의", body: "새 문의", url: STAFF_PUSH_ROUTES.home });
    await vi.waitFor(() => expect(prisma.pushNotificationReceipt.createMany).toHaveBeenCalled());
    expect(prisma.messageLog.createMany).not.toHaveBeenCalled();
  });
});
