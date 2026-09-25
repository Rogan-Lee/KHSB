"use server";

import { auth } from "@/lib/auth";
import { broadcastPush, type BroadcastAudience } from "@/lib/broadcast-push";
import { prisma } from "@/lib/prisma";
import { requireAnyStaff, requireFullAccess } from "@/lib/roles";
import { getStaffThread, listStaffThreads, sendStaffThreadMessage } from "@/lib/staff-dm";

// DM 상대 셀렉트(messages/page.tsx)는 STUDENT 외 전 직원을 보여주므로
// 온라인 직원(CONSULTANT/MANAGER_MENTOR)도 포함하는 requireAnyStaff 로 판별.
async function requireStaffSession() {
  const session = await auth();
  requireAnyStaff(session?.user?.role);
  return session!.user;
}

// DM 핵심 로직은 @/lib/staff-dm (모바일 API 와 공용)

/** 내 스레드 목록 — 상대 정보 + 마지막 메시지 + 안 읽음 수 */
export async function listMyThreads() {
  const me = await requireStaffSession();
  return listStaffThreads(me.id);
}

/**
 * 스레드 조회 — 없으면 생성. 메시지는 오래된 순.
 * 상대가 보낸 미확인 메시지는 읽음 처리.
 */
export async function getThread(otherUserId: string) {
  const me = await requireStaffSession();
  return getStaffThread(me.id, otherUserId);
}

/** 메시지 전송 + 상대에게 푸시 (fire-and-forget) */
export async function sendStaffMessage(otherUserId: string, content: string) {
  const me = await requireStaffSession();
  return sendStaffThreadMessage({ id: me.id, name: me.name }, otherUserId, content);
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
 * 단체 푸시 발송 (원장 전용). 핵심 로직은 @/lib/broadcast-push (모바일 라우트와 공용).
 */
// ponytail: 학부모 대상 자동 푸시(리포트 발행·질문 답변 등 이벤트 트리거)는 미연결 —
// 필요해지면 해당 액션에서 ParentLink 로 authUserId 조회 후 sendMobilePush 호출 추가
export async function sendBroadcastPush(params: {
  audience: BroadcastAudience;
  title: string;
  body: string;
}) {
  const session = await auth();
  requireFullAccess(session?.user?.role);
  return broadcastPush(params);
}
