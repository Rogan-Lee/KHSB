import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contentReport: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    portalChat: { findUnique: vi.fn(), updateMany: vi.fn() },
    portalChatMessage: { deleteMany: vi.fn(), findUnique: vi.fn() },
    questionMessage: { deleteMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
    staffThreadMessage: { deleteMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    student: { findUnique: vi.fn() },
    user: { findFirst: vi.fn(), findUnique: vi.fn() },
    userBlock: {
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));
vi.mock("@/lib/slack", () => ({ notifySlack: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuthIdentity: vi.fn() }));

import { prisma } from "@/lib/prisma";
import {
  assertCanMessage,
  blockUser,
  createReport,
  getBlockState,
  resolveContentReport,
  unblockUser,
} from "@/lib/safety";
import { notifySlack } from "@/lib/slack";

const student = { type: "STUDENT", id: "student-1", name: "김학생" } as const;
const staff = { type: "STAFF", id: "staff-1", name: "이멘토" } as const;
const parent = { type: "PARENT", id: "auth-9", name: "김학부모" } as const;

// 학생 student-1 과 직원 staff-1 의 대화방에서 직원이 보낸 메시지
const staffChatMessage = {
  id: "msg-1",
  senderType: "STAFF",
  senderUserId: "staff-1",
  content: "신고할 글",
  attachments: [{ url: "https://blob.example/a.jpg", name: "a.jpg" }],
  senderUser: { name: "이멘토" },
  chat: {
    id: "chat-1",
    studentId: "student-1",
    staffId: "staff-1",
    student: { name: "김학생" },
    staff: { name: "이멘토" },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.contentReport.count).mockResolvedValue(0);
  vi.mocked(prisma.contentReport.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.userBlock.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.userBlock.findUnique).mockResolvedValue(null);
});

describe("createReport", () => {
  it("records a chat message report with the author and a snapshot of the text", async () => {
    vi.mocked(prisma.portalChatMessage.findUnique).mockResolvedValue(staffChatMessage as never);

    const result = await createReport(student, {
      targetType: "CHAT_MESSAGE",
      targetId: "msg-1",
      reason: "ABUSE",
      detail: " 불쾌했어요 ",
    });

    expect(result).toEqual({ ok: true, duplicate: false });
    expect(prisma.contentReport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reporterType: "STUDENT",
        reporterId: "student-1",
        reporterName: "김학생",
        targetType: "CHAT_MESSAGE",
        targetId: "msg-1",
        contextId: "chat-1",
        targetUserType: "STAFF",
        targetUserId: "staff-1",
        targetUserName: "이멘토",
        reason: "ABUSE",
        detail: "불쾌했어요",
        snapshot: "신고할 글\n첨부: https://blob.example/a.jpg",
      }),
    });
    expect(notifySlack).toHaveBeenCalledTimes(1);
  });

  it("does not let someone outside the chat report (or probe) a message", async () => {
    vi.mocked(prisma.portalChatMessage.findUnique).mockResolvedValue(staffChatMessage as never);

    await expect(
      createReport({ ...student, id: "student-2" }, {
        targetType: "CHAT_MESSAGE",
        targetId: "msg-1",
        reason: "ABUSE",
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(prisma.contentReport.create).not.toHaveBeenCalled();
  });

  it("rejects reporting my own message", async () => {
    vi.mocked(prisma.portalChatMessage.findUnique).mockResolvedValue(staffChatMessage as never);

    await expect(
      createReport(staff, { targetType: "CHAT_MESSAGE", targetId: "msg-1", reason: "SPAM" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("keeps one open report per target", async () => {
    vi.mocked(prisma.portalChatMessage.findUnique).mockResolvedValue(staffChatMessage as never);
    vi.mocked(prisma.contentReport.findFirst).mockResolvedValue({ id: "report-1" } as never);

    const result = await createReport(student, {
      targetType: "CHAT_MESSAGE",
      targetId: "msg-1",
      reason: "ABUSE",
    });

    expect(result).toEqual({ ok: true, duplicate: true });
    expect(prisma.contentReport.create).not.toHaveBeenCalled();
  });

  it("limits reports per day", async () => {
    vi.mocked(prisma.portalChatMessage.findUnique).mockResolvedValue(staffChatMessage as never);
    vi.mocked(prisma.contentReport.count).mockResolvedValue(20);

    await expect(
      createReport(student, { targetType: "CHAT_MESSAGE", targetId: "msg-1", reason: "ABUSE" }),
    ).rejects.toMatchObject({ status: 429 });
  });

  it("lets staff report a student's question message", async () => {
    vi.mocked(prisma.questionMessage.findUnique).mockResolvedValue({
      id: "qm-1",
      senderType: "STUDENT",
      senderUserId: null,
      content: "내용",
      attachments: [],
      senderUser: null,
      question: { id: "q-1", studentId: "student-1", title: "제목", student: { name: "김학생" } },
    } as never);

    await createReport(staff, { targetType: "QUESTION_MESSAGE", targetId: "qm-1", reason: "OTHER" });

    expect(prisma.contentReport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contextId: "q-1",
        targetUserType: "STUDENT",
        targetUserId: "student-1",
        snapshot: "[제목] 내용",
      }),
    });
  });

  it("requires a reason", async () => {
    await expect(
      createReport(student, { targetType: "CHAT_MESSAGE", targetId: "msg-1" }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("blockUser", () => {
  it("blocks a staff member the student has a chat with and clears unread", async () => {
    vi.mocked(prisma.portalChat.findUnique).mockResolvedValue({ id: "chat-1" } as never);
    vi.mocked(prisma.questionMessage.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: "staff-1",
      name: "이멘토",
      role: "MENTOR",
    } as never);

    const result = await blockUser(student, { userType: "STAFF", userId: "staff-1" });

    expect(result.user).toMatchObject({ type: "STAFF", id: "staff-1", name: "이멘토" });
    expect(prisma.userBlock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          blockerType: "STUDENT",
          blockerId: "student-1",
          blockedType: "STAFF",
          blockedId: "staff-1",
          blockedName: "이멘토",
        },
      }),
    );
    expect(prisma.portalChat.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentId: "student-1", staffId: "staff-1" } }),
    );
    expect(notifySlack).toHaveBeenCalledTimes(1);
  });

  it("does not notify again when already blocked", async () => {
    vi.mocked(prisma.portalChat.findUnique).mockResolvedValue({ id: "chat-1" } as never);
    vi.mocked(prisma.questionMessage.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "staff-1", name: "이멘토", role: "MENTOR" } as never);
    vi.mocked(prisma.userBlock.findUnique).mockResolvedValue({ id: "block-1" } as never);

    await blockUser(student, { userType: "STAFF", userId: "staff-1" });

    expect(prisma.userBlock.upsert).not.toHaveBeenCalled();
    expect(notifySlack).not.toHaveBeenCalled();
  });

  it("hides staff the student never talked to", async () => {
    vi.mocked(prisma.portalChat.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.questionMessage.findFirst).mockResolvedValue(null);

    await expect(
      blockUser(student, { userType: "STAFF", userId: "staff-9" }),
    ).rejects.toMatchObject({ status: 404 });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("rejects blocking yourself and parent accounts", async () => {
    await expect(
      blockUser(staff, { userType: "STAFF", userId: "staff-1" }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      blockUser(parent, { userType: "STAFF", userId: "staff-1" }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("unblocks only my own block", async () => {
    vi.mocked(prisma.userBlock.deleteMany).mockResolvedValue({ count: 1 } as never);

    await unblockUser(student, { userType: "STAFF", userId: "staff-1" });

    expect(prisma.userBlock.deleteMany).toHaveBeenCalledWith({
      where: {
        blockerType: "STUDENT",
        blockerId: "student-1",
        blockedType: "STAFF",
        blockedId: "staff-1",
      },
    });
  });
});

describe("block state", () => {
  it("tells apart who blocked whom", async () => {
    vi.mocked(prisma.userBlock.findMany).mockResolvedValue([
      { blockerType: "STAFF", blockerId: "staff-1" },
    ] as never);

    expect(await getBlockState(student, staff)).toEqual({ blockedByMe: false, blockedByOther: true });
    expect(await getBlockState(staff, student)).toEqual({ blockedByMe: true, blockedByOther: false });
  });

  it("stops messages in both directions", async () => {
    vi.mocked(prisma.userBlock.findMany).mockResolvedValue([
      { blockerType: "STUDENT", blockerId: "student-1" },
    ] as never);

    await expect(assertCanMessage(student, staff)).rejects.toMatchObject({ status: 403 });
    await expect(assertCanMessage(staff, student)).rejects.toMatchObject({ status: 403 });

    vi.mocked(prisma.userBlock.findMany).mockResolvedValue([] as never);
    await expect(assertCanMessage(student, staff)).resolves.toBeUndefined();
  });
});

describe("resolveContentReport", () => {
  const director = { id: "director-1", name: "원장" };
  const openReport = {
    id: "report-1",
    status: "OPEN",
    targetType: "CHAT_MESSAGE",
    targetId: "msg-1",
  };

  it("deletes the reported message and closes every open report about it", async () => {
    vi.mocked(prisma.contentReport.findUnique).mockResolvedValue(openReport as never);

    await resolveContentReport(director, { reportId: "report-1", resolution: "REMOVED" });

    expect(prisma.portalChatMessage.deleteMany).toHaveBeenCalledWith({ where: { id: "msg-1" } });
    expect(prisma.contentReport.updateMany).toHaveBeenCalledWith({
      where: { status: "OPEN", targetType: "CHAT_MESSAGE", targetId: "msg-1" },
      data: expect.objectContaining({
        status: "RESOLVED",
        resolution: "REMOVED",
        resolvedById: "director-1",
        resolvedByName: "원장",
      }),
    });
  });

  it("keeps the message for other outcomes", async () => {
    vi.mocked(prisma.contentReport.findUnique).mockResolvedValue(openReport as never);

    await resolveContentReport(director, {
      reportId: "report-1",
      resolution: "DISMISSED",
      note: "확인함",
    });

    expect(prisma.portalChatMessage.deleteMany).not.toHaveBeenCalled();
    expect(prisma.contentReport.updateMany).toHaveBeenCalledWith({
      where: { id: "report-1", status: "OPEN" },
      data: expect.objectContaining({ resolution: "DISMISSED", resolutionNote: "확인함" }),
    });
  });

  it("has nothing to delete for a user report", async () => {
    vi.mocked(prisma.contentReport.findUnique).mockResolvedValue({
      id: "report-2",
      status: "OPEN",
      targetType: "USER",
      targetId: null,
    } as never);

    await expect(
      resolveContentReport(director, { reportId: "report-2", resolution: "REMOVED" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(prisma.contentReport.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to resolve twice", async () => {
    vi.mocked(prisma.contentReport.findUnique).mockResolvedValue({
      ...openReport,
      status: "RESOLVED",
    } as never);

    await expect(
      resolveContentReport(director, { reportId: "report-1", resolution: "WARNED" }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
