import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
    familyChat: { findUnique: vi.fn(), update: vi.fn() },
    familyChatMessage: { create: vi.fn(), findMany: vi.fn() },
    familyChatRead: { findUnique: vi.fn(), upsert: vi.fn() },
    parentLink: { findUnique: vi.fn() },
    student: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/mobile-push", () => ({ sendMobilePush: vi.fn() }));
vi.mock("@/lib/safety", () => ({ getBlockedKeys: vi.fn() }));
vi.mock("@/lib/slack", () => ({ notifySlack: vi.fn() }));
vi.mock("@vercel/blob", () => ({ del: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getBlockedKeys } from "@/lib/safety";
import { getFamilyThread, parentDisplayName, sendFamilyMessage } from "@/lib/family-chat";

const chat = { id: "fc-1", studentId: "s-1", lastMessageAt: null, familyMessageAt: null, staffReadAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.familyChat.findUnique).mockResolvedValue(chat as never);
  vi.mocked(prisma.familyChatMessage.create).mockResolvedValue({ id: "m-1" } as never);
  vi.mocked(prisma.student.findUnique).mockResolvedValue(null);
  vi.mocked(getBlockedKeys).mockResolvedValue(new Set());
});

describe("sendFamilyMessage", () => {
  it("parent message marks the room unread for staff and read for the sender", async () => {
    vi.mocked(prisma.parentLink.findUnique).mockResolvedValue({ relation: "모", authUser: { name: "김OO" } } as never);

    await sendFamilyMessage("s-1", { kind: "PARENT", id: "auth-1" }, { content: " 늦어요 " });

    expect(prisma.familyChatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ senderName: "어머니", content: "늦어요" }) }),
    );
    const update = vi.mocked(prisma.familyChat.update).mock.calls[0][0];
    expect(update.data).toHaveProperty("familyMessageAt");
    expect(update.data).not.toHaveProperty("staffReadAt");
    expect(prisma.familyChatRead.upsert).toHaveBeenCalled();
  });

  it("staff message counts as staff having read it, without touching the unread marker", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ name: "이멘토", role: "MENTOR" } as never);

    await sendFamilyMessage("s-1", { kind: "STAFF", id: "u-1" }, { content: "확인했어요" });

    const update = vi.mocked(prisma.familyChat.update).mock.calls[0][0];
    expect(update.data).toHaveProperty("staffReadAt");
    expect(update.data).not.toHaveProperty("familyMessageAt");
    expect(prisma.familyChatRead.upsert).not.toHaveBeenCalled();
  });

  it("refuses an empty message and parents of other children", async () => {
    await expect(sendFamilyMessage("s-1", { kind: "STAFF", id: "u-1" }, { content: "  " })).rejects.toMatchObject({
      status: 400,
    });
    vi.mocked(prisma.parentLink.findUnique).mockResolvedValue(null);
    await expect(sendFamilyMessage("s-1", { kind: "PARENT", id: "auth-9" }, { content: "안녕하세요" })).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe("getFamilyThread", () => {
  it("hides authors I blocked but keeps automatic notices", async () => {
    vi.mocked(getBlockedKeys).mockResolvedValue(new Set(["STAFF:u-2"]));
    const at = new Date("2026-11-13T00:00:00Z");
    vi.mocked(prisma.familyChatMessage.findMany).mockResolvedValue([
      { id: "a", senderKind: "STAFF", senderId: "u-2", senderName: "x", content: "", attachments: [], createdAt: at },
      { id: "b", senderKind: "SYSTEM", senderId: null, senderName: "자동 알림", content: "입실", attachments: [], createdAt: at },
    ] as never);

    const thread = await getFamilyThread("s-1", { kind: "PARENT", id: "auth-1" });

    expect(thread.messages.map((m) => m.id)).toEqual(["b"]);
  });
});

it("parentDisplayName maps relation shorthand", () => {
  expect(parentDisplayName("부", "김OO")).toBe("아버지");
  expect(parentDisplayName(null, "김OO")).toBe("김OO");
});
