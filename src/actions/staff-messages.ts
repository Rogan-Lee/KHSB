"use server";

import { auth } from "@/lib/auth";
import { sendMobilePush } from "@/lib/mobile-push";
import { prisma } from "@/lib/prisma";
import { requireFullAccess, requireStaff } from "@/lib/roles";

const MAX_CONTENT_LEN = 4000;

async function requireStaffSession() {
  const session = await auth();
  requireStaff(session?.user?.role);
  return session!.user;
}

/** aUserId < bUserId 정규화 (스키마 규약) */
function normalizePair(userA: string, userB: string) {
  return userA < userB
    ? { aUserId: userA, bUserId: userB }
    : { aUserId: userB, bUserId: userA };
}

/** 내 스레드 목록 — 상대 정보 + 마지막 메시지 + 안 읽음 수 */
export async function listMyThreads() {
  const me = await requireStaffSession();

  const threads = await prisma.staffThread.findMany({
    where: { OR: [{ aUserId: me.id }, { bUserId: me.id }] },
    orderBy: { lastMessageAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { content: true, senderId: true, createdAt: true },
      },
    },
  });

  const otherIds = threads.map((t) => (t.aUserId === me.id ? t.bUserId : t.aUserId));
  const [others, unreadCounts] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: otherIds } },
      select: { id: true, name: true, role: true },
    }),
    Promise.all(
      threads.map((t) =>
        prisma.staffThreadMessage.count({
          where: { threadId: t.id, senderId: { not: me.id }, readAt: null },
        })
      )
    ),
  ]);
  const otherById = new Map(others.map((u) => [u.id, u]));

  return threads.map((t, i) => {
    const otherId = t.aUserId === me.id ? t.bUserId : t.aUserId;
    const other = otherById.get(otherId);
    const last = t.messages[0] ?? null;
    return {
      id: t.id,
      other: {
        id: otherId,
        name: other?.name ?? "(알 수 없음)",
        role: other?.role ?? null,
      },
      lastMessage: last
        ? {
            content: last.content,
            mine: last.senderId === me.id,
            createdAt: last.createdAt.toISOString(),
          }
        : null,
      lastMessageAt: t.lastMessageAt.toISOString(),
      unread: unreadCounts[i],
    };
  });
}

/**
 * 스레드 조회 — 없으면 생성. 메시지는 오래된 순.
 * 상대가 보낸 미확인 메시지는 읽음 처리.
 */
export async function getThread(otherUserId: string) {
  const me = await requireStaffSession();
  if (otherUserId === me.id) throw new Error("본인과는 대화할 수 없습니다");

  const other = await prisma.user.findUnique({
    where: { id: otherUserId },
    select: { id: true, name: true, role: true },
  });
  if (!other) throw new Error("직원을 찾을 수 없습니다");

  const pair = normalizePair(me.id, otherUserId);
  const thread = await prisma.staffThread.upsert({
    where: { aUserId_bUserId: pair },
    update: {},
    create: pair,
  });

  const [messages] = await Promise.all([
    prisma.staffThreadMessage.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
    prisma.staffThreadMessage.updateMany({
      where: { threadId: thread.id, senderId: otherUserId, readAt: null },
      data: { readAt: new Date() },
    }),
  ]);

  return {
    threadId: thread.id,
    other,
    messages: messages.map((m) => ({
      id: m.id,
      content: m.content,
      mine: m.senderId === me.id,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

/** 메시지 전송 + 상대에게 푸시 (fire-and-forget) */
export async function sendStaffMessage(otherUserId: string, content: string) {
  const me = await requireStaffSession();
  if (otherUserId === me.id) throw new Error("본인과는 대화할 수 없습니다");

  const trimmed = content.trim();
  if (!trimmed) throw new Error("내용을 입력해 주세요");
  if (trimmed.length > MAX_CONTENT_LEN) {
    throw new Error(`메시지는 ${MAX_CONTENT_LEN}자 이하로 작성해 주세요`);
  }

  const other = await prisma.user.findUnique({
    where: { id: otherUserId },
    select: { id: true },
  });
  if (!other) throw new Error("직원을 찾을 수 없습니다");

  const pair = normalizePair(me.id, otherUserId);
  const now = new Date();
  const thread = await prisma.staffThread.upsert({
    where: { aUserId_bUserId: pair },
    update: { lastMessageAt: now },
    create: { ...pair, lastMessageAt: now },
  });
  await prisma.staffThreadMessage.create({
    data: { threadId: thread.id, senderId: me.id, content: trimmed },
  });

  // 상대 푸시 — fire-and-forget, 실패 무시
  void (async () => {
    const authUser = await prisma.authUser.findUnique({
      where: { appUserId: otherUserId },
      select: { id: true },
    });
    if (!authUser) return;
    await sendMobilePush({
      authUserIds: [authUser.id],
      body: trimmed.slice(0, 150),
      category: "SYSTEM",
      data: { threadOtherUserId: me.id, url: "/messages" },
      title: `${me.name}님의 메시지`,
    });
  })().catch((error) => console.error("[staff-dm push]", error));

  return { ok: true };
}

/** 사이드바 뱃지용 — 내가 안 읽은 직원 메시지 수 */
export async function getUnreadStaffDmCount() {
  const me = await requireStaffSession();
  return prisma.staffThreadMessage.count({
    where: {
      readAt: null,
      senderId: { not: me.id },
      thread: { OR: [{ aUserId: me.id }, { bUserId: me.id }] },
    },
  });
}

/**
 * 단체 푸시 발송 (원장 전용).
 * 발송 이력 저장은 이번엔 생략.
 * // ponytail: 이력 테이블 없음 — 감사/재발송 필요해지면 BroadcastPushLog 모델 추가
 */
export async function sendBroadcastPush(params: {
  audience: "ALL" | "STUDENTS" | "STAFF";
  title: string;
  body: string;
}) {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  const title = params.title.trim();
  const body = params.body.trim();
  if (!title || !body) throw new Error("제목과 내용을 입력해 주세요");
  if (title.length > 100) throw new Error("제목은 100자 이하로 작성해 주세요");
  if (body.length > 1000) throw new Error("내용은 1000자 이하로 작성해 주세요");

  // AuthUser.studentId 유무로 학생/직원 구분
  const audienceFilter =
    params.audience === "STUDENTS"
      ? { studentId: { not: null } }
      : params.audience === "STAFF"
        ? { appUserId: { not: null } }
        : {};

  const targets = await prisma.authUser.findMany({
    where: {
      ...audienceFilter,
      pushTokens: { some: { enabled: true } },
    },
    select: { id: true },
  });
  if (targets.length === 0) return { targets: 0, sent: 0 };

  const { sent } = await sendMobilePush({
    authUserIds: targets.map((t) => t.id),
    body,
    category: "SYSTEM",
    data: { broadcast: true },
    title,
  });
  return { targets: targets.length, sent };
}
