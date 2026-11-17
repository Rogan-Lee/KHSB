// 가족 톡방 — 학생 1명당 방 1개 (학생 + 연결된 학부모 + 운영진 전체).
// 웹 서버 액션(src/actions/family-chat.ts)과 모바일 API(/api/mobile/v1/*/family-chat)가 같이 쓴다.
// 호출 측이 먼저 신원과 학생 접근 권한을 확인한다 (학부모 = requireParentChild, 학생 = 본인, 직원 = isAnyStaff).
// "use server" 파일이 아니므로 여기 export 는 공개 엔드포인트가 아니다.
//
//  · 멤버 테이블 없음: 학부모는 ParentLink, 운영진은 직원 전체. 그때그때 계산한다.
//  · 읽음: 학생·학부모는 개인별(FamilyChatRead), 운영진은 방마다 하나(staffReadAt)를 같이 쓴다.
//  · 운영진 미확인은 학생·학부모 글(familyMessageAt)만 본다 — 입퇴실 자동 알림 때문에 배지가 켜지지 않게.
//  · 차단(src/lib/safety.ts): 단체방이라 전송은 막지 않고, 내가 차단한 사람의 글만 내 화면에서 뺀다.

import { del } from "@vercel/blob";
import { z } from "zod";

import type { FamilyChatSender } from "@/generated/prisma/enums";
import { latestIdsPerGroup } from "@/lib/db/latest-per-group";
import { MobileApiError } from "@/lib/mobile-auth";
import { authUserIdsForAppUsers, sendMobilePush, sendToStaff } from "@/lib/mobile-push";
import { sanitizePortalAttachments, type PortalAttachment } from "@/lib/portal-attachments";
import { prisma } from "@/lib/prisma";
import { ROLE_DISPLAY } from "@/lib/roles";
import { getBlockedKeys } from "@/lib/safety";

const MAX_CONTENT_LEN = 4000;
const MAX_ATTACHMENTS = 5;
const DEFAULT_PAGE = 50;
const MAX_PAGE = 100;
const SYSTEM_NAME = "자동 알림";
export const FAMILY_CHAT_RETENTION_DAYS = 365;

export type FamilyViewer =
  | { kind: "STUDENT"; id: string } // Student.id
  | { kind: "PARENT"; id: string } // AuthUser.id
  | { kind: "STAFF"; id: string }; // User.id

/** 앱 알림을 눌렀을 때 이동할 경로 — 앱 src/lib/notifications.ts 허용 목록과 맞춘다 */
export const FAMILY_CHAT_PUSH_ROUTES = {
  parent: "/(parent)/(tabs)/chat",
  student: "/(student)/family-chat",
  staff: (studentId: string) => `/(staff)/family-chat/${studentId}`,
};

export type FamilyChatMessageView = {
  id: string;
  mine: boolean;
  senderKind: FamilyChatSender;
  senderId: string | null;
  senderName: string;
  content: string;
  attachments: PortalAttachment[];
  createdAt: string;
};

// ─── 표시 이름 ─────────────────────────────────────────────────────────

const RELATION_LABEL: Record<string, string> = {
  모: "어머니",
  부: "아버지",
  엄마: "어머니",
  아빠: "아버지",
};

/** 학부모 표시 이름 — 관계("모")가 있으면 "어머니", 없으면 계정 이름 */
export function parentDisplayName(relation: string | null | undefined, accountName: string) {
  const r = relation?.trim();
  if (r) return RELATION_LABEL[r] ?? r;
  return accountName.trim() || "학부모";
}

export function staffDisplayName(name: string, role: string) {
  const label = ROLE_DISPLAY[role];
  return label && role !== "SUPER_ADMIN" ? `${name} ${label}` : name;
}

async function senderNameOf(studentId: string, viewer: FamilyViewer): Promise<string> {
  if (viewer.kind === "STUDENT") {
    const s = await prisma.student.findUnique({ where: { id: viewer.id }, select: { name: true } });
    return s?.name ?? "학생";
  }
  if (viewer.kind === "PARENT") {
    const link = await prisma.parentLink.findUnique({
      where: { authUserId_studentId: { authUserId: viewer.id, studentId } },
      select: { relation: true, authUser: { select: { name: true } } },
    });
    if (!link) throw new MobileApiError("자녀 정보에 접근할 수 없습니다", 403);
    return parentDisplayName(link.relation, link.authUser.name);
  }
  const u = await prisma.user.findUnique({ where: { id: viewer.id }, select: { name: true, role: true } });
  return u ? staffDisplayName(u.name, u.role) : "운영진";
}

// ─── 방 ────────────────────────────────────────────────────────────────

/** 방을 찾고 없으면 만든다 (폴링마다 upsert 하지 않게 먼저 읽는다) */
export async function ensureFamilyChat(studentId: string) {
  const select = { id: true, studentId: true, lastMessageAt: true, familyMessageAt: true, staffReadAt: true };
  const found = await prisma.familyChat.findUnique({ where: { studentId }, select });
  if (found) return found;
  return prisma.familyChat.upsert({ where: { studentId }, update: {}, create: { studentId }, select });
}

/** 방 멤버 (머리말 표시용) — 학생, 연결된 학부모. 운영진은 "운영진 전체" 로만 표시 */
export async function getFamilyMembers(studentId: string) {
  const [student, links] = await Promise.all([
    prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, name: true, grade: true, school: true, status: true },
    }),
    prisma.parentLink.findMany({
      where: { studentId },
      orderBy: { createdAt: "asc" },
      select: { authUserId: true, relation: true, authUser: { select: { name: true } } },
    }),
  ]);
  if (!student) throw new MobileApiError("학생을 찾을 수 없습니다", 404);
  return {
    student,
    parents: links.map((l) => ({ id: l.authUserId, name: parentDisplayName(l.relation, l.authUser.name) })),
  };
}

// ─── 대화 ──────────────────────────────────────────────────────────────

function viewerKey(v: FamilyViewer) {
  return `${v.kind}:${v.id}`;
}

function parseDate(value: string | undefined) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new MobileApiError("요청 형식을 확인해 주세요", 400);
  return d;
}

/**
 * 대화 불러오기.
 *  · before: 그 이전 메시지 한 페이지 (위로 스크롤)
 *  · after: 그 이후 메시지만 (열려 있는 화면의 증분 폴링 — egress 절감)
 *  · 둘 다 없으면 최신 한 페이지. before 가 없으면 읽음 처리(새 글이 있을 때만 쓴다).
 *  · peek: 읽음 처리 없이 (목록 미리보기)
 */
export async function getFamilyThread(
  studentId: string,
  viewer: FamilyViewer,
  opts: { before?: string; after?: string; limit?: number; peek?: boolean } = {},
) {
  const chat = await ensureFamilyChat(studentId);
  const limit = Math.min(Math.max(Math.floor(opts.limit ?? DEFAULT_PAGE), 1), MAX_PAGE);
  const before = parseDate(opts.before);
  const after = parseDate(opts.after);

  const [rows, blocked] = await Promise.all([
    prisma.familyChatMessage.findMany({
      where: {
        chatId: chat.id,
        ...(before ? { createdAt: { lt: before } } : after ? { createdAt: { gt: after } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      select: {
        id: true,
        senderKind: true,
        senderId: true,
        senderName: true,
        content: true,
        attachments: true,
        createdAt: true,
      },
    }),
    getBlockedKeys({ type: viewer.kind, id: viewer.id }),
  ]);
  const hasMore = !after && rows.length > limit;
  const page = rows.slice(0, limit).reverse();

  if (!before && !opts.peek) await markRead(chat, viewer);

  const me = viewerKey(viewer);
  const messages: FamilyChatMessageView[] = page
    .filter((m) => !(m.senderId && blocked.has(`${m.senderKind}:${m.senderId}`)))
    .map((m) => ({
      id: m.id,
      mine: m.senderId !== null && `${m.senderKind}:${m.senderId}` === me,
      senderKind: m.senderKind,
      senderId: m.senderId,
      senderName: m.senderName,
      content: m.content,
      attachments: sanitizePortalAttachments(m.attachments, MAX_ATTACHMENTS),
      createdAt: m.createdAt.toISOString(),
    }));

  return { chatId: chat.id, studentId, hasMore, messages };
}

async function markRead(
  chat: { id: string; lastMessageAt: Date | null; familyMessageAt: Date | null; staffReadAt: Date | null },
  viewer: FamilyViewer,
) {
  const now = new Date();
  if (viewer.kind === "STAFF") {
    if (chat.familyMessageAt && (!chat.staffReadAt || chat.staffReadAt < chat.familyMessageAt)) {
      await prisma.familyChat.update({ where: { id: chat.id }, data: { staffReadAt: now }, select: { id: true } });
    }
    return;
  }
  if (!chat.lastMessageAt) return;
  const key = { chatId: chat.id, readerKind: viewer.kind, readerId: viewer.id };
  const read = await prisma.familyChatRead.findUnique({
    where: { chatId_readerKind_readerId: key },
    select: { lastReadAt: true },
  });
  if (read && read.lastReadAt >= chat.lastMessageAt) return;
  await prisma.familyChatRead.upsert({
    where: { chatId_readerKind_readerId: key },
    update: { lastReadAt: now },
    create: { ...key, lastReadAt: now },
  });
}

/** 읽음 처리만 (앱이 화면을 떠날 때 등) */
export async function markFamilyChatRead(studentId: string, viewer: FamilyViewer) {
  await markRead(await ensureFamilyChat(studentId), viewer);
  return { ok: true };
}

const messageSchema = z.object({
  content: z.string().max(MAX_CONTENT_LEN, `메시지는 ${MAX_CONTENT_LEN}자 이하로 작성해 주세요`).default(""),
  attachments: z.unknown().optional(),
});

/** 메시지 보내기 (내용 또는 첨부 필수). 받는 사람에게 앱 알림은 응답 뒤에 보낸다. */
export async function sendFamilyMessage(
  studentId: string,
  viewer: FamilyViewer,
  input: { content?: unknown; attachments?: unknown },
) {
  const parsed = messageSchema.safeParse({ content: input.content ?? "", attachments: input.attachments });
  if (!parsed.success) {
    throw new MobileApiError(parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요", 400);
  }
  const content = parsed.data.content.trim();
  const attachments = sanitizePortalAttachments(parsed.data.attachments, MAX_ATTACHMENTS);
  if (!content && attachments.length === 0) {
    throw new MobileApiError("메시지나 첨부 파일을 넣어 주세요", 400);
  }

  const [chat, senderName] = await Promise.all([ensureFamilyChat(studentId), senderNameOf(studentId, viewer)]);
  const now = new Date();
  const fromFamily = viewer.kind !== "STAFF";
  const [message] = await prisma.$transaction([
    prisma.familyChatMessage.create({
      data: {
        chatId: chat.id,
        senderKind: viewer.kind,
        senderId: viewer.id,
        senderName,
        content,
        attachments: attachments as unknown as object,
        createdAt: now,
      },
      select: { id: true },
    }),
    prisma.familyChat.update({
      where: { id: chat.id },
      data: {
        lastMessageAt: now,
        ...(fromFamily ? { familyMessageAt: now } : { staffReadAt: now }),
      },
      select: { id: true },
    }),
    ...(fromFamily
      ? [
          prisma.familyChatRead.upsert({
            where: { chatId_readerKind_readerId: { chatId: chat.id, readerKind: viewer.kind, readerId: viewer.id } },
            update: { lastReadAt: now },
            create: { chatId: chat.id, readerKind: viewer.kind, readerId: viewer.id, lastReadAt: now },
          }),
        ]
      : []),
  ]);

  const preview = content.slice(0, 80) || `사진·파일 ${attachments.length}개`;
  // 알림 실패가 전송을 막지 않게 — 기다리지 않는다
  void notifyFamilyMessage(studentId, viewer, senderName, preview).catch((error) =>
    console.error("[family-chat:push]", error),
  );

  return { ok: true, id: message.id };
}

/** 새 글 알림 — 보낸 사람을 뺀 학생·학부모, 학생·학부모가 보냈으면 담당 직원(없으면 원장급)에게도 */
async function notifyFamilyMessage(studentId: string, viewer: FamilyViewer, senderName: string, preview: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      name: true,
      authIdentity: { select: { id: true } },
      parentLinks: { select: { authUserId: true } },
      mentorId: true,
      assignedMentorId: true,
      assignedConsultantId: true,
      assignedStaffId: true,
    },
  });
  if (!student) return;
  const title = `${student.name} 가족 톡방`;
  const body = `${senderName}: ${preview}`;
  const base = { kind: "family-chat", studentId };
  const parentIds = student.parentLinks
    .map((l) => l.authUserId)
    .filter((id) => !(viewer.kind === "PARENT" && id === viewer.id));
  const studentAuthId = viewer.kind === "STUDENT" ? null : student.authIdentity?.id ?? null;

  const sends: Promise<unknown>[] = [
    sendMobilePush({
      authUserIds: parentIds,
      title,
      body,
      category: "FAMILY_CHAT",
      data: { ...base, audience: "parent", url: FAMILY_CHAT_PUSH_ROUTES.parent },
    }),
  ];
  if (studentAuthId) {
    sends.push(
      sendMobilePush({
        authUserIds: [studentAuthId],
        title: "가족 톡방",
        body,
        category: "FAMILY_CHAT",
        data: { ...base, audience: "student", url: FAMILY_CHAT_PUSH_ROUTES.student },
      }),
    );
  }
  if (viewer.kind !== "STAFF") {
    // 직원 전체가 들어오는 방이지만 알림은 담당자에게만 (재직 담당자가 없거나 아무 기기도 못 받으면 원장급) — 나머지는 배지로 본다
    const assigned = await authUserIdsForAppUsers([
      student.mentorId,
      student.assignedMentorId,
      student.assignedConsultantId,
      student.assignedStaffId,
    ]);
    sends.push(
      sendToStaff(assigned, {
        title,
        body,
        category: "FAMILY_CHAT",
        data: { ...base, audience: "staff", url: FAMILY_CHAT_PUSH_ROUTES.staff(studentId) },
      }),
    );
  }
  await Promise.allSettled(sends);
}

/**
 * 자동 알림(입퇴실·리포트 도착 등)을 방에 남긴다. 앱 알림은 보내지 않는다 —
 * 같은 사건의 학부모 푸시가 따로 나가기 때문. 실패해도 throw 하지 않는다.
 */
export async function postFamilySystemMessage(studentId: string, content: string) {
  try {
    const chat = await ensureFamilyChat(studentId);
    const now = new Date();
    await prisma.$transaction([
      prisma.familyChatMessage.create({
        data: { chatId: chat.id, senderKind: "SYSTEM", senderName: SYSTEM_NAME, content, createdAt: now },
        select: { id: true },
      }),
      prisma.familyChat.update({ where: { id: chat.id }, data: { lastMessageAt: now }, select: { id: true } }),
    ]);
  } catch (error) {
    console.error("[family-chat:system]", error);
  }
}

// ─── 목록·배지 ─────────────────────────────────────────────────────────

/** 운영진 목록 — 재원생 전체(방이 아직 없는 학생 포함). 미확인 → 최근 대화 → 이름 순 */
export async function listFamilyChatsForStaff(staffId: string) {
  const students = await prisma.student.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      grade: true,
      school: true,
      seat: true,
      isOnlineManaged: true,
      mentorId: true,
      assignedMentorId: true,
      assignedConsultantId: true,
      assignedStaffId: true,
      _count: { select: { parentLinks: true } },
      familyChat: { select: { id: true, lastMessageAt: true, familyMessageAt: true, staffReadAt: true } },
    },
  });
  const chatIds = students.flatMap((s) => (s.familyChat ? [s.familyChat.id] : []));
  const lastIds = await latestIdsPerGroup({
    table: "FamilyChatMessage",
    groupBy: "chatId",
    groupIds: chatIds,
    orderBy: [{ column: "createdAt", dir: "desc" }],
  });
  const lasts = lastIds.length
    ? await prisma.familyChatMessage.findMany({
        where: { id: { in: lastIds } },
        select: { chatId: true, senderName: true, content: true, attachments: true, createdAt: true },
      })
    : [];
  const lastByChat = new Map(lasts.map((m) => [m.chatId, m]));

  const rooms = students.map((s) => {
    const c = s.familyChat;
    const last = c ? lastByChat.get(c.id) : undefined;
    return {
      studentId: s.id,
      name: s.name,
      grade: s.grade,
      school: s.school,
      seat: s.seat,
      isOnlineManaged: s.isOnlineManaged,
      isMine: [s.mentorId, s.assignedMentorId, s.assignedConsultantId, s.assignedStaffId].includes(staffId),
      parentCount: s._count.parentLinks,
      unread: !!c?.familyMessageAt && (!c.staffReadAt || c.staffReadAt < c.familyMessageAt),
      lastMessageAt: c?.lastMessageAt?.toISOString() ?? null,
      lastMessage: last
        ? {
            senderName: last.senderName,
            content: last.content || (Array.isArray(last.attachments) && last.attachments.length ? "사진·파일" : ""),
          }
        : null,
    };
  });
  return rooms.sort(
    (a, b) =>
      Number(b.unread) - Number(a.unread) ||
      (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "") ||
      a.name.localeCompare(b.name, "ko"),
  );
}

/** 운영진 미확인 방 수 (사이드바·직원 앱 배지) */
export async function staffUnreadFamilyChatStats() {
  const rows = await prisma.familyChat.findMany({
    where: { familyMessageAt: { not: null }, student: { status: "ACTIVE" } },
    select: { familyMessageAt: true, staffReadAt: true },
  });
  const unread = rows.filter((r) => !r.staffReadAt || r.staffReadAt < r.familyMessageAt!);
  const newest = unread.reduce<Date | null>((max, r) => (!max || r.familyMessageAt! > max ? r.familyMessageAt : max), null);
  return { count: unread.length, newest };
}

/** 학생·학부모 미확인 메시지 수 (자녀 여럿이면 합) — 내가 쓴 글은 빼고 */
export async function countFamilyUnread(studentIds: string[], viewer: FamilyViewer) {
  if (studentIds.length === 0 || viewer.kind === "STAFF") return 0;
  const chats = await prisma.familyChat.findMany({
    where: { studentId: { in: studentIds }, lastMessageAt: { not: null } },
    select: {
      id: true,
      lastMessageAt: true,
      reads: { where: { readerKind: viewer.kind, readerId: viewer.id }, select: { lastReadAt: true } },
    },
  });
  const pending = chats
    .map((c) => ({ id: c.id, readAt: c.reads[0]?.lastReadAt ?? null, last: c.lastMessageAt! }))
    .filter((c) => !c.readAt || c.readAt < c.last);
  if (pending.length === 0) return 0;
  return prisma.familyChatMessage.count({
    where: {
      OR: pending.map((c) => ({ chatId: c.id, ...(c.readAt ? { createdAt: { gt: c.readAt } } : {}) })),
      NOT: { senderKind: viewer.kind, senderId: viewer.id },
    },
  });
}

// ─── 보관 기간 ─────────────────────────────────────────────────────────

/**
 * 퇴원(재원 아님) 후 1년이 지난 학생의 방을 첨부 파일과 함께 지운다 — 개인정보 처리방침 보관 기간.
 * 퇴원일(endDate)이 없으면 마지막 수정 시각을 기준으로 본다.
 */
export async function purgeExpiredFamilyChats(now = new Date()) {
  const cutoff = new Date(now.getTime() - FAMILY_CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const chats = await prisma.familyChat.findMany({
    where: {
      student: {
        status: { not: "ACTIVE" },
        OR: [{ endDate: { lt: cutoff } }, { endDate: null, updatedAt: { lt: cutoff } }],
      },
    },
    select: { id: true },
  });
  if (chats.length === 0) return { deletedChats: 0, deletedFiles: 0 };
  const chatIds = chats.map((c) => c.id);

  const withFiles = await prisma.familyChatMessage.findMany({
    where: { chatId: { in: chatIds }, NOT: { attachments: { equals: [] } } },
    select: { attachments: true },
  });
  const urls = withFiles.flatMap((m) =>
    sanitizePortalAttachments(m.attachments, MAX_ATTACHMENTS)
      .map((a) => a.url)
      .filter((url) => url.includes(".blob.vercel-storage.com/")),
  );
  let deletedFiles = 0;
  for (let i = 0; i < urls.length; i += 100) {
    const batch = urls.slice(i, i + 100);
    try {
      await del(batch);
      deletedFiles += batch.length;
    } catch (error) {
      // 파일 삭제가 실패해도 대화는 지운다 (다음 실행에서 다시 찾을 방법이 없으니 로그로 남긴다)
      console.error("[family-chat:retention] blob 삭제 실패", error);
    }
  }
  const { count } = await prisma.familyChat.deleteMany({ where: { id: { in: chatIds } } });
  return { deletedChats: count, deletedFiles };
}
