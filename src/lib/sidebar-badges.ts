import { prisma } from "@/lib/prisma";
import { isFullAccess } from "@/lib/roles";
import { todayKST } from "@/lib/utils";

/**
 * 사이드바 미확인 배지 전체 집계 — (dashboard)·/online 레이아웃과
 * /api/sidebar-badges 폴링이 공유하는 단일 소스.
 * 항목별 실패는 해당 배지만 생략 (레이아웃 렌더 차단 금지).
 */
export async function getSidebarBadges(
  userId: string,
  role?: string | null,
): Promise<Record<string, number>> {
  const [requests, suggestions, questions, chats, proposals, examApps, lunchRequests, parentFeedback] =
    await Promise.allSettled([
      // /requests — 내가 아직 안 본 열린 기능 요청
      prisma.featureRequest.count({
        where: {
          status: { in: ["PENDING", "IN_PROGRESS"] },
          NOT: { seenById: { has: userId } },
        },
      }),
      // /suggestions — 접수(RECEIVED) 상태. 삭제·숨김·퇴원생 제외
      prisma.studentSuggestion.count({
        where: { status: "RECEIVED", deletedAt: null, hiddenAt: null, student: { status: "ACTIVE" } },
      }),
      // /questions — 직원 미확인 (새 질문 + 학생 추가 메시지)
      prisma.studentQuestion.count({
        where: { staffReadAt: null, status: { not: "ARCHIVED" }, student: { status: "ACTIVE" } },
      }),
      // /online/inbox — 내 채팅방 중 학생 메시지 미확인 방 수
      prisma.portalChat.findMany({
        where: { staffId: userId, lastMessageAt: { not: null }, student: { status: "ACTIVE" } },
        select: { lastMessageAt: true, staffReadAt: true },
      }),
      // /online/schedules — 운영진 검토 대기(SUBMITTED). 학생별 최신 버전 기준
      prisma.scheduleProposal.findMany({
        where: { status: { in: ["SUBMITTED", "PROPOSED", "APPROVED", "REJECTED"] } },
        select: { studentId: true, version: true, status: true },
      }),
      // /exams — 확정 대기 모의고사 신청 (지난 시험 제외)
      prisma.examApplication.count({
        where: {
          status: "PENDING",
          student: { status: "ACTIVE" },
          session: { examDate: { gte: todayKST() } },
        },
      }),
      // /lunch — 미답변 학부모 변경 요청
      prisma.lunchChangeRequest.count({
        where: { reply: null, student: { status: "ACTIVE" } },
      }),
      // /online/reports — 학부모 피드백 미확인 (원장만)
      isFullAccess(role)
        ? prisma.onlineParentFeedback.count({ where: { readAt: null } })
        : Promise.resolve(0),
    ]);

  const badges: Record<string, number> = {};
  const set = (href: string, r: PromiseSettledResult<number>) => {
    if (r.status === "fulfilled" && r.value > 0) badges[href] = r.value;
  };

  set("/requests", requests);
  set("/suggestions", suggestions);
  set("/questions", questions);
  if (chats.status === "fulfilled") {
    const unreadChats = chats.value.filter(
      (c) => c.lastMessageAt && (!c.staffReadAt || c.lastMessageAt > c.staffReadAt),
    ).length;
    if (unreadChats > 0) badges["/online/inbox"] = unreadChats;
  }
  if (proposals.status === "fulfilled") {
    // 학생별 최신 버전만 검토 대상 (구버전 SUBMITTED 잔존분 제외 — 목록과 동일 기준)
    const latest = new Map<string, { version: number; status: string }>();
    for (const p of proposals.value) {
      const cur = latest.get(p.studentId);
      if (!cur || p.version > cur.version) latest.set(p.studentId, p);
    }
    const submitted = [...latest.values()].filter((p) => p.status === "SUBMITTED").length;
    if (submitted > 0) badges["/online/schedules"] = submitted;
  }
  set("/exams", examApps);
  set("/lunch", lunchRequests);
  set("/online/reports", parentFeedback);

  return badges;
}
