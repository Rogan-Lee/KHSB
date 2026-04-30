"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOnlineStaff } from "@/lib/roles";
import { validateMagicLink } from "@/lib/student-auth";
import { notifySlack } from "@/lib/slack";
import type { PortalChatSenderType } from "@/generated/prisma/enums";

export type ChatAttachment = {
  url: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
};

const MAX_CONTENT_LEN = 4000;
const MAX_ATTACHMENTS = 5;

/**
 * 학생의 담당 직원(mentor/consultant/staff)에 대해 채팅방 row를 보장.
 * 없으면 생성, 있으면 그대로. 반환은 보장된 chat row 목록 (lastMessageAt desc).
 */
export async function ensureStudentPortalChats(studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      assignedMentorId: true,
      assignedConsultantId: true,
      assignedStaffId: true,
    },
  });
  if (!student) throw new Error("학생을 찾을 수 없습니다");

  const staffIds = [
    student.assignedMentorId,
    student.assignedConsultantId,
    student.assignedStaffId,
  ].filter((id): id is string => !!id);

  for (const staffId of staffIds) {
    await prisma.portalChat.upsert({
      where: { studentId_staffId: { studentId: student.id, staffId } },
      update: {},
      create: { studentId: student.id, staffId },
    });
  }

  return prisma.portalChat.findMany({
    where: { studentId: student.id, staffId: { in: staffIds } },
    orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    include: {
      staff: { select: { id: true, name: true, role: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          content: true,
          senderType: true,
          createdAt: true,
          attachments: true,
        },
      },
    },
  });
}

/** 학생 포털용 채팅 리스트 — 토큰 인증. */
export async function listStudentChats(params: { studentToken: string }) {
  const session = await validateMagicLink(params.studentToken);
  if (!session) throw new Error("인증이 만료되었습니다");
  const chats = await ensureStudentPortalChats(session.student.id);

  // 정확한 unread 카운트: 학생이 읽은 시각 이후로 STAFF가 보낸 메시지
  const unreadCounts = await Promise.all(
    chats.map((c) =>
      prisma.portalChatMessage.count({
        where: {
          chatId: c.id,
          senderType: "STAFF",
          createdAt: c.studentReadAt ? { gt: c.studentReadAt } : undefined,
        },
      })
    )
  );

  return chats.map((c, i) => {
    const last = c.messages[0] ?? null;
    return {
      id: c.id,
      staff: c.staff,
      lastMessage: last
        ? {
            content: last.content,
            senderType: last.senderType,
            createdAt: last.createdAt.toISOString(),
            hasAttachments:
              Array.isArray(last.attachments) &&
              (last.attachments as unknown[]).length > 0,
          }
        : null,
      lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      unread: unreadCounts[i],
    };
  });
}

/**
 * 직원 인박스 — 자기가 담당하는 학생들의 채팅방 리스트.
 * staffSession 의 user.id 기준.
 */
export async function listStaffInbox() {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user || !role || !isOnlineStaff(role)) {
    throw new Error("권한이 없습니다");
  }
  const staffId = session.user.id;

  // 담당 학생 자동으로 채팅방 보장
  const myStudents = await prisma.student.findMany({
    where: {
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
      student: {
        select: {
          id: true,
          name: true,
          school: true,
          grade: true,
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          content: true,
          senderType: true,
          createdAt: true,
          attachments: true,
        },
      },
    },
  });

  // 직원이 안 읽은 메시지 수: staffReadAt 이후 학생이 보낸 메시지 카운트
  const unreadCounts = await Promise.all(
    chats.map((c) =>
      prisma.portalChatMessage.count({
        where: {
          chatId: c.id,
          senderType: "STUDENT",
          createdAt: c.staffReadAt ? { gt: c.staffReadAt } : undefined,
        },
      })
    )
  );

  return chats.map((c, i) => {
    const last = c.messages[0] ?? null;
    return {
      id: c.id,
      student: c.student,
      lastMessage: last
        ? {
            content: last.content,
            senderType: last.senderType,
            createdAt: last.createdAt.toISOString(),
            hasAttachments:
              Array.isArray(last.attachments) &&
              (last.attachments as unknown[]).length > 0,
          }
        : null,
      lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      unread: unreadCounts[i],
    };
  });
}

/**
 * 단일 채팅방 메시지 조회 — 학생/직원 모두 사용.
 * 권한: 학생 토큰 또는 직원 세션 (chat 의 staffId 와 매칭)
 */
export async function getChatMessages(params: {
  chatId: string;
  studentToken?: string;
  before?: string; // ISO date — 페이지네이션
  limit?: number;
}) {
  const { chatId, studentToken, before, limit = 50 } = params;
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

  let viewer: "STUDENT" | "STAFF" | null = null;

  if (studentToken) {
    const s = await validateMagicLink(studentToken);
    if (s && s.student.id === chat.studentId) viewer = "STUDENT";
  }
  if (!viewer) {
    const session = await auth();
    if (
      session?.user?.id === chat.staffId &&
      isOnlineStaff(session.user.role)
    ) {
      viewer = "STAFF";
    }
  }
  if (!viewer) throw new Error("권한이 없습니다");

  const messages = await prisma.portalChatMessage.findMany({
    where: {
      chatId,
      ...(before ? { createdAt: { lt: new Date(before) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      senderUser: { select: { id: true, name: true } },
    },
  });

  return {
    chat: { id: chat.id, student: chat.student, staff: chat.staff },
    viewer,
    messages: messages.reverse().map((m) => ({
      id: m.id,
      senderType: m.senderType,
      senderName:
        m.senderType === "STUDENT" ? chat.student.name : m.senderUser?.name ?? null,
      content: m.content,
      attachments: Array.isArray(m.attachments)
        ? (m.attachments as unknown as ChatAttachment[])
        : [],
      flaggedForDailyLogAt: m.flaggedForDailyLogAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

/** 메시지 전송 — 학생 또는 직원. */
export async function sendChatMessage(params: {
  chatId: string;
  studentToken?: string;
  content: string;
  attachments?: ChatAttachment[];
}) {
  const { chatId, studentToken, content, attachments = [] } = params;
  const trimmed = content.trim();
  if (!trimmed && attachments.length === 0) {
    throw new Error("내용 또는 첨부가 필요합니다");
  }
  if (trimmed.length > MAX_CONTENT_LEN) {
    throw new Error(`메시지는 ${MAX_CONTENT_LEN}자 이하로 작성해 주세요`);
  }
  if (attachments.length > MAX_ATTACHMENTS) {
    throw new Error(`첨부는 ${MAX_ATTACHMENTS}개 이하만 가능합니다`);
  }

  const chat = await prisma.portalChat.findUnique({
    where: { id: chatId },
    select: {
      id: true,
      studentId: true,
      staffId: true,
      student: { select: { name: true } },
      staff: { select: { name: true } },
    },
  });
  if (!chat) throw new Error("채팅방을 찾을 수 없습니다");

  let senderType: PortalChatSenderType;
  let senderUserId: string | null = null;

  if (studentToken) {
    const s = await validateMagicLink(studentToken);
    if (!s || s.student.id !== chat.studentId) {
      throw new Error("권한이 없습니다");
    }
    senderType = "STUDENT";
  } else {
    const session = await auth();
    if (
      session?.user?.id !== chat.staffId ||
      !isOnlineStaff(session.user.role)
    ) {
      throw new Error("권한이 없습니다");
    }
    senderType = "STAFF";
    senderUserId = session.user.id;
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.portalChatMessage.create({
      data: {
        chatId,
        senderType,
        senderUserId,
        content: trimmed,
        attachments: attachments as unknown as object,
      },
    }),
    prisma.portalChat.update({
      where: { id: chatId },
      data: {
        lastMessageAt: now,
        // 자기 측 readAt 갱신, 상대방 readAt 그대로
        ...(senderType === "STUDENT"
          ? { studentReadAt: now }
          : { staffReadAt: now }),
      },
    }),
  ]);

  // Slack notify (학생 메시지만; fire-and-forget)
  if (senderType === "STUDENT") {
    notifySlack(
      `[학생 포털 채팅] ${chat.student.name} → ${chat.staff.name}: ${trimmed.slice(0, 200)}`
    );
  }

  // 캐시 무효화 — 학생 포털 + 직원 인박스
  revalidatePath(`/online/inbox`);
  revalidatePath(`/online/students/${chat.studentId}`);
  // 학생 토큰 path 는 token이 다양하니 layout-level 무효화는 클라에서 router.refresh()로 처리

  return { ok: true };
}

/** 채팅방 읽음 처리. */
export async function markChatRead(params: {
  chatId: string;
  studentToken?: string;
}) {
  const { chatId, studentToken } = params;
  const chat = await prisma.portalChat.findUnique({
    where: { id: chatId },
    select: { id: true, studentId: true, staffId: true },
  });
  if (!chat) throw new Error("채팅방을 찾을 수 없습니다");

  let side: "STUDENT" | "STAFF";
  if (studentToken) {
    const s = await validateMagicLink(studentToken);
    if (!s || s.student.id !== chat.studentId) {
      throw new Error("권한이 없습니다");
    }
    side = "STUDENT";
  } else {
    const session = await auth();
    if (
      session?.user?.id !== chat.staffId ||
      !isOnlineStaff(session.user.role)
    ) {
      throw new Error("권한이 없습니다");
    }
    side = "STAFF";
  }

  await prisma.portalChat.update({
    where: { id: chatId },
    data:
      side === "STUDENT"
        ? { studentReadAt: new Date() }
        : { staffReadAt: new Date() },
  });

  revalidatePath(`/online/inbox`);
  return { ok: true };
}

