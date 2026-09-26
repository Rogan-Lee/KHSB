// 모바일 포털 채팅 — 세션으로 이미 인증된 studentId/staffId 를 받아 동작.
// 웹 src/actions/online/portal-chat.ts 의 토큰/세션 기반과 달리, 모바일은
// requireMobile* 가드가 신원을 확정한 뒤 호출한다. 인가는 채팅방 소유권으로 판정.
// 목록·스레드 규칙(현재/이전 담당자, 미확인 수, 읽음 처리)은 웹 학생 포털과 같다.

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ChatAttachment } from "@/actions/online/portal-chat";
import { ensureStudentPortalChats } from "@/lib/portal-chat-core";
import { MobileApiError } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { ROLE_DISPLAY } from "@/lib/roles";
import { notifySlack } from "@/lib/slack";

const MAX_CONTENT_LEN = 4000;
const MAX_ATTACHMENTS = 5;
const DEFAULT_PAGE = 50;
const MAX_PAGE = 100;

export type ChatViewer = { type: "STUDENT" | "STAFF"; id: string };

/** 학생 포털과 같은 담당자 역할 라벨 (웹 chat/page.tsx ROLE_LABEL) */
const PORTAL_ROLE_LABEL: Record<string, string> = {
  CONSULTANT: "컨설턴트",
  MANAGER_MENTOR: "관리 멘토",
  STAFF: "운영조교",
  DIRECTOR: "원장",
  ADMIN: "관리자",
  SUPER_ADMIN: "관리자",
  MENTOR: "멘토",
};

function staffRoleLabel(role: string) {
  return PORTAL_ROLE_LABEL[role] ?? ROLE_DISPLAY[role] ?? "직원";
}

function studentLabel(student: { grade: string | null; school: string | null }) {
  return [student.grade, student.school].filter(Boolean).join(" · ") || "학생";
}

function hasAttachments(value: unknown): boolean {
  return Array.isArray(value) && (value as unknown[]).length > 0;
}

function toAttachments(value: unknown): ChatAttachment[] {
  return Array.isArray(value) ? (value as ChatAttachment[]) : [];
}

const attachmentSchema = z.object({
  url: z
    .string()
    .trim()
    .max(2000)
    .refine((url) => url.startsWith("https://"), "첨부 파일 주소가 올바르지 않아요"),
  name: z.string().trim().min(1).max(200),
  sizeBytes: z.number().int().min(0),
  mimeType: z.string().trim().min(1).max(120),
});

const messageSchema = z.object({
  content: z
    .string()
    .max(MAX_CONTENT_LEN, `메시지는 ${MAX_CONTENT_LEN}자 이하로 작성해 주세요`)
    .default(""),
  attachments: z
    .array(attachmentSchema)
    .max(MAX_ATTACHMENTS, `첨부는 ${MAX_ATTACHMENTS}개까지 보낼 수 있어요`)
    .default([]),
});

function parseMessage(input: unknown) {
  const result = messageSchema.safeParse(input);
  if (!result.success) {
    throw new MobileApiError(result.error.issues[0]?.message ?? "입력값을 확인해 주세요", 400);
  }
  return result.data;
}

/** 학생의 현재 담당자(오프라인 멘토 + 온라인 배정) id 목록 */
async function currentAssigneeIds(studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      mentorId: true,
      assignedMentorId: true,
      assignedConsultantId: true,
      assignedStaffId: true,
    },
  });
  return new Set(
    [
      student?.assignedMentorId,
      student?.assignedConsultantId,
      student?.assignedStaffId,
      student?.mentorId,
    ].filter((id): id is string => !!id),
  );
}

/**
 * 학생 채팅 목록 — 웹 listStudentChats 와 같은 기준.
 * 현재 담당자 방은 메시지가 없어도 항상, 이전 담당자 방은 대화가 한 번이라도 있었을 때만.
 */
export async function getStudentChats(studentId: string) {
  await ensureStudentPortalChats(studentId);
  const current = await currentAssigneeIds(studentId);

  const chats = await prisma.portalChat.findMany({
    where: {
      studentId,
      OR: [{ staffId: { in: [...current] } }, { lastMessageAt: { not: null } }],
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
      isCurrentAssignee: current.has(c.staffId),
      partner: {
        id: c.staff.id,
        name: c.staff.name,
        role: c.staff.role as string,
        roleLabel: staffRoleLabel(c.staff.role),
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

/** 직원 인박스 — 담당 학생들과의 채팅방 (웹 listStaffInbox 와 같은 기준: 오프라인 멘토 포함). */
export async function getStaffChats(staffId: string) {
  const myStudents = await prisma.student.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { mentorId: staffId },
        { assignedMentorId: staffId },
        { assignedConsultantId: staffId },
        { assignedStaffId: staffId },
      ],
    },
    select: { id: true },
  });
  const studentIds = myStudents.map((s) => s.id);
  if (studentIds.length > 0) {
    const existing = await prisma.portalChat.findMany({
      where: { staffId, studentId: { in: studentIds } },
      select: { studentId: true },
    });
    const have = new Set(existing.map((c) => c.studentId));
    const missing = studentIds.filter((id) => !have.has(id));
    if (missing.length > 0) {
      await prisma.portalChat.createMany({
        data: missing.map((studentId) => ({ studentId, staffId })),
        skipDuplicates: true,
      });
    }
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
        role: "STUDENT",
        roleLabel: studentLabel(c.student),
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
      lastMessageAt: true,
      studentReadAt: true,
      staffReadAt: true,
      student: { select: { id: true, name: true, grade: true, school: true } },
      staff: { select: { id: true, name: true, role: true } },
    },
  });
  if (!chat) throw new MobileApiError("대화방을 찾을 수 없어요", 404);
  const owned =
    viewer.type === "STUDENT" ? chat.studentId === viewer.id : chat.staffId === viewer.id;
  if (!owned) throw new MobileApiError("이 대화방을 볼 권한이 없어요", 403);
  return chat;
}

/**
 * 단일 채팅방 메시지 + 상대 정보.
 * 최신 구간 조회(before 없음) 시 상대가 보낸 새 메시지가 있을 때만 읽음 처리 — 5초 폴링에도 쓰기 부담이 없도록.
 * `before`(ISO) 로 이전 메시지를 페이지 단위로 불러온다. hasMore = 더 오래된 메시지가 남아 있음.
 */
export async function getChatThread(
  chatId: string,
  viewer: ChatViewer,
  opts: { before?: string; limit?: number } = {},
) {
  const chat = await loadOwnedChat(chatId, viewer);
  const limit = Math.min(Math.max(Math.floor(opts.limit ?? DEFAULT_PAGE), 1), MAX_PAGE);
  let before: Date | null = null;
  if (opts.before) {
    before = new Date(opts.before);
    if (Number.isNaN(before.getTime())) throw new MobileApiError("요청 형식을 확인해 주세요", 400);
  }

  const rows = await prisma.portalChatMessage.findMany({
    where: { chatId, ...(before ? { createdAt: { lt: before } } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    include: { senderUser: { select: { id: true, name: true } } },
  });
  const hasMore = rows.length > limit;
  const messages = rows.slice(0, limit).reverse();

  // 조회 = 읽음 (최신 구간에서, 읽지 않은 게 있을 때만)
  if (!before) {
    const readAt = viewer.type === "STUDENT" ? chat.studentReadAt : chat.staffReadAt;
    if (chat.lastMessageAt && (!readAt || readAt < chat.lastMessageAt)) {
      await prisma.portalChat.update({
        where: { id: chatId },
        data:
          viewer.type === "STUDENT" ? { studentReadAt: new Date() } : { staffReadAt: new Date() },
      });
    }
  }

  const partner =
    viewer.type === "STUDENT"
      ? {
          id: chat.staff.id,
          name: chat.staff.name,
          role: chat.staff.role as string,
          roleLabel: staffRoleLabel(chat.staff.role),
        }
      : {
          id: chat.student.id,
          name: chat.student.name,
          role: "STUDENT",
          roleLabel: studentLabel(chat.student),
        };

  return {
    chatId: chat.id,
    partner,
    hasMore,
    messages: messages.map((m) => ({
      id: m.id,
      mine: m.senderType === viewer.type,
      senderType: m.senderType,
      senderName:
        m.senderType === "STUDENT" ? chat.student.name : m.senderUser?.name ?? chat.staff.name,
      content: m.content,
      attachments: toAttachments(m.attachments),
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

/** 메시지 전송 (내용 또는 첨부 필수). */
export async function sendChat(params: {
  chatId: string;
  viewer: ChatViewer;
  content: unknown;
  attachments?: unknown;
}) {
  const { chatId, viewer } = params;
  const data = parseMessage({ content: params.content ?? "", attachments: params.attachments ?? [] });
  const trimmed = data.content.trim();
  if (!trimmed && data.attachments.length === 0) {
    throw new MobileApiError("메시지나 첨부 파일을 넣어 주세요", 400);
  }

  const chat = await loadOwnedChat(chatId, viewer);
  const now = new Date();
  await prisma.$transaction([
    prisma.portalChatMessage.create({
      data: {
        chatId,
        senderType: viewer.type,
        senderUserId: viewer.type === "STAFF" ? viewer.id : null,
        content: trimmed,
        attachments: data.attachments as unknown as object,
      },
    }),
    prisma.portalChat.update({
      where: { id: chatId },
      data: {
        lastMessageAt: now,
        // 자기 측 readAt 만 갱신, 상대방 readAt 그대로
        ...(viewer.type === "STUDENT" ? { studentReadAt: now } : { staffReadAt: now }),
      },
    }),
  ]);

  if (viewer.type === "STUDENT") {
    void notifySlack(
      `📱 [학생 포털 채팅] ${chat.student.name} → ${chat.staff.name}: ${
        trimmed.slice(0, 200) || `첨부 ${data.attachments.length}개`
      }`,
    );
  }

  // 웹 직원 인박스·학생 상세 캐시 무효화 (웹 sendChatMessage 와 동일)
  revalidatePath("/online/inbox");
  revalidatePath(`/online/students/${chat.studentId}`);

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
