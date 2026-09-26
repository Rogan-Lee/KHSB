// 직원 DM(1:1 메시지) 핵심 로직 — 웹 서버 액션(src/actions/staff-messages.ts)과
// 모바일 API(src/lib/mobile-staff-dm.ts)가 같이 쓴다.
// 호출 측이 먼저 직원 세션을 검증하고 본인 정보를 넘긴다.

import { MobileApiError } from "@/lib/mobile-auth";
import { sendMobilePush } from "@/lib/mobile-push";
import { prisma } from "@/lib/prisma";

export const STAFF_DM_MAX_LEN = 4000;

export type StaffDmActor = { id: string; name: string | null };

/** aUserId < bUserId 정규화 (스키마 규약) */
function normalizePair(userA: string, userB: string) {
  return userA < userB
    ? { aUserId: userA, bUserId: userB }
    : { aUserId: userB, bUserId: userA };
}

/** 내 스레드 목록 — 상대 정보 + 마지막 메시지 + 안 읽음 수 (최근 대화순) */
export async function listStaffThreads(meId: string) {
  const threads = await prisma.staffThread.findMany({
    where: { OR: [{ aUserId: meId }, { bUserId: meId }] },
    orderBy: { lastMessageAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { content: true, senderId: true, createdAt: true },
      },
    },
  });

  const otherIds = threads.map((t) => (t.aUserId === meId ? t.bUserId : t.aUserId));
  const [others, unreadCounts] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: otherIds } },
      select: { id: true, name: true, role: true },
    }),
    Promise.all(
      threads.map((t) =>
        prisma.staffThreadMessage.count({
          where: { threadId: t.id, senderId: { not: meId }, readAt: null },
        }),
      ),
    ),
  ]);
  const otherById = new Map(others.map((u) => [u.id, u]));

  return threads.map((t, i) => {
    const otherId = t.aUserId === meId ? t.bUserId : t.aUserId;
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
            mine: last.senderId === meId,
            createdAt: last.createdAt.toISOString(),
          }
        : null,
      lastMessageAt: t.lastMessageAt.toISOString(),
      unread: unreadCounts[i],
    };
  });
}

/**
 * 스레드 조회 — 없으면 생성. 메시지는 오래된 순(최근 200개).
 * 상대가 보낸 미확인 메시지는 읽음 처리.
 */
export async function getStaffThread(meId: string, otherUserId: string) {
  if (otherUserId === meId) throw new MobileApiError("본인과는 대화할 수 없습니다", 400);

  const other = await prisma.user.findUnique({
    where: { id: otherUserId },
    select: { id: true, name: true, role: true },
  });
  // 직원 간 DM 전용 — 학생 계정과는 스레드를 만들지 않는다 (퇴사 직원과의 지난 대화 열람은 허용)
  if (!other || other.role === "STUDENT") throw new MobileApiError("직원을 찾을 수 없습니다", 404);

  const pair = normalizePair(meId, otherUserId);
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
      mine: m.senderId === meId,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

/** 메시지 전송 + 상대에게 푸시 (fire-and-forget, 실패 무시) */
export async function sendStaffThreadMessage(
  me: StaffDmActor,
  otherUserId: string,
  content: string,
) {
  if (otherUserId === me.id) throw new MobileApiError("본인과는 대화할 수 없습니다", 400);

  const trimmed = content.trim();
  if (!trimmed) throw new MobileApiError("내용을 입력해 주세요", 400);
  if (trimmed.length > STAFF_DM_MAX_LEN) {
    throw new MobileApiError(`메시지는 ${STAFF_DM_MAX_LEN}자 이하로 작성해 주세요`, 400);
  }

  const other = await prisma.user.findUnique({
    where: { id: otherUserId },
    select: { id: true, role: true, status: true },
  });
  // 새 메시지는 활성 직원에게만 (학생 계정·비활성 계정으로 푸시 발송 방지)
  if (!other || other.role === "STUDENT" || other.status !== "ACTIVE") {
    throw new MobileApiError("직원을 찾을 수 없습니다", 404);
  }

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

  // 상대 푸시 — fire-and-forget, 실패 무시. url 은 앱의 직원 소통 탭.
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
      data: { threadOtherUserId: me.id, url: "/(staff)/(tabs)/inbox" },
      title: `${me.name ?? "직원"}님의 메시지`,
    });
  })().catch((error) => console.error("[staff-dm push]", error));

  return { ok: true };
}
