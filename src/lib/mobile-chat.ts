// 모바일 포털 채팅 — 세션으로 이미 인증된 studentId/staffId 를 받아 동작.
// 웹 src/actions/online/portal-chat.ts 의 토큰/세션 기반과 달리, 모바일은
// requireMobile* 가드가 신원을 확정한 뒤 호출한다. 인가는 채팅방 소유권으로 판정.

import { prisma } from "@/lib/prisma";
import { ensureStudentPortalChats, type ChatAttachment } from "@/actions/online/portal-chat";
import { ROLE_DISPLAY } from "@/lib/roles";

const MAX_CONTENT_LEN = 4000;
const MAX_ATTACHMENTS = 5;

export type ChatViewer = { type: "STUDENT" | "STAFF"; id: string };

function hasAttachments(value: unknown): boolean {
  return Array.isArray(value) && (value as unknown[]).length > 0;
}

/** 학생 채팅 목록 (담당 직원별 채팅방). */
export async function getStudentChats(studentId: string) {
  await ensureStudentPortalChats(studentId);

  const chats = await prisma.portalChat.findMany({
    where: {
      studentId,
      OR: [{ lastMessageAt: { not: null } }, { lastMessageAt: null }],
    },
    orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    include: {
      staff: { select: { id: true, name: true, role: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { content: true, senderType: true, createdAt: true, attachments: true },
      },
    },
  });

  const unread = await Promise.all(
    chats.map((c) =>
      prisma.portalChatMessage.count({
        where: {
          chatId: c.id,
          senderType: "STAFF",
          createdAt: c.studentReadAt ? { gt: c.studentReadAt } : undefined,
        },
      }),
    ),
  );

  return chats.map((c, i) => {
    const last = c.messages[0] ?? null;
    return {
      id: c.id,
      partner: {
        id: c.staff.id,
        name: c.staff.name,
        roleLabel: ROLE_DISPLAY[c.staff.role] ?? "담당 선생님",
      },
      lastMessage: last
        ? {
            content: last.content,
            senderType: last.senderType,
            createdAt: last.createdAt.toISOString(),
            hasAttachments: hasAttachments(last.attachments),
          }
        : null,
      lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      unread: unread[i],
    };
  });
}

/** 직원 인박스 — 담당 학생들과의 채팅방. */
export async function getStaffChats(staffId: string) {
  const myStudents = await prisma.student.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { assignedMentorId: staffId },
        { assignedConsultantId: staffId },
        { assignedStaffId: staffId },
      ],
    },
    select: { id: true },
  });
  for (const s of myStudents) {
    await prisma.portalChat.upsert({
      where: { studentId_staffId: { studentId: s.id, staffId } },
      update: {},
      create: { studentId: s.id, staffId },
    });
  }

  const chats = await prisma.portalChat.findMany({
    where: { staffId },
    orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    include: {
      student: { select: { id: true, name: true, grade: true, school: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { content: true, senderType: true, createdAt: true, attachments: true },
      },
    },
  });

  const unread = await Promise.all(
    chats.map((c) =>
      prisma.portalChatMessage.count({
        where: {
          chatId: c.id,
          senderType: "STUDENT",
          createdAt: c.staffReadAt ? { gt: c.staffReadAt } : undefined,
        },
      }),
    ),
  );

  return chats.map((c, i) => {
    const last = c.messages[0] ?? null;
    return {
      id: c.id,
      partner: {
        id: c.student.id,
        name: c.student.name,
        roleLabel: [c.student.grade, c.student.school].filter(Boolean).join(" · ") || "학생",
      },
      lastMessage: last
        ? {
            content: last.content,
            senderType: last.senderType,
            createdAt: last.createdAt.toISOString(),
            hasAttachments: hasAttachments(last.attachments),
          }
        : null,
      lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      unread: unread[i],
    };
  });
}

async function loadOwnedChat(chatId: string, viewer: ChatViewer) {
  const chat = await prisma.portalChat.findUnique({
    where: { id: chatId },
    select: {
      id: true,
      studentId: true,
      staffId: true,
      student: { select: { id: true, name: true } },
      staff: { select: { id: true, name: true, role: true } },
    },
  });
  if (!chat) throw new Error("채팅방을 찾을 수 없습니다");
  const owned =
    viewer.type === "STUDENT" ? chat.studentId === viewer.id : chat.staffId === viewer.id;
  if (!owned) throw new Error("권한이 없습니다");
  return chat;
}

/** 단일 채팅방 메시지 + 상대 정보. 조회 시 본인 읽음 처리. */
export async function getChatThread(
  chatId: string,
  viewer: ChatViewer,
  opts: { before?: string; limit?: number } = {},
) {
  const chat = await loadOwnedChat(chatId, viewer);
  const { before, limit = 50 } = opts;

  const messages = await prisma.portalChatMessage.findMany({
    where: { chatId, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { senderUser: { select: { id: true, name: true } } },
  });

  // 조회 = 읽음
  await prisma.portalChat.update({
    where: { id: chatId },
    data: viewer.type === "STUDENT" ? { studentReadAt: new Date() } : { staffReadAt: new Date() },
  });

  const partner =
    viewer.type === "STUDENT"
      ? { id: chat.staff.id, name: chat.staff.name, roleLabel: ROLE_DISPLAY[chat.staff.role] ?? "담당 선생님" }
      : { id: chat.student.id, name: chat.student.name, roleLabel: "학생" };

  return {
    chatId: chat.id,
    partner,
    messages: messages.reverse().map((m) => ({
      id: m.id,
      mine: m.senderType === viewer.type,
      senderType: m.senderType,
      content: m.content,
      attachments: Array.isArray(m.attachments)
        ? (m.attachments as unknown as ChatAttachment[])
        : [],
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

/** 메시지 전송. */
export async function sendChat(params: {
  chatId: string;
  viewer: ChatViewer;
  content: string;
  attachments?: ChatAttachment[];
}) {
  const { chatId, viewer, content, attachments = [] } = params;
  const trimmed = content.trim();
  if (!trimmed && attachments.length === 0) throw new Error("내용 또는 첨부가 필요합니다");
  if (trimmed.length > MAX_CONTENT_LEN)
    throw new Error(`메시지는 ${MAX_CONTENT_LEN}자 이하로 작성해 주세요`);
  if (attachments.length > MAX_ATTACHMENTS)
    throw new Error(`첨부는 ${MAX_ATTACHMENTS}개 이하만 가능합니다`);

  await loadOwnedChat(chatId, viewer);
  const now = new Date();
  await prisma.$transaction([
    prisma.portalChatMessage.create({
      data: {
        chatId,
        senderType: viewer.type,
        senderUserId: viewer.type === "STAFF" ? viewer.id : null,
        content: trimmed,
        attachments: attachments as unknown as object,
      },
    }),
    prisma.portalChat.update({
      where: { id: chatId },
      data: {
        lastMessageAt: now,
        ...(viewer.type === "STUDENT" ? { studentReadAt: now } : { staffReadAt: now }),
      },
    }),
  ]);

  return { ok: true };
}

/** 읽음 처리. */
export async function markChatRead(chatId: string, viewer: ChatViewer) {
  await loadOwnedChat(chatId, viewer);
  await prisma.portalChat.update({
    where: { id: chatId },
    data: viewer.type === "STUDENT" ? { studentReadAt: new Date() } : { staffReadAt: new Date() },
  });
  return { ok: true };
}
