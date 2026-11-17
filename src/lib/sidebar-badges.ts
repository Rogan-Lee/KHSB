import { countStaffUnreadFamilyChats } from "@/lib/family-chat";
import { prisma } from "@/lib/prisma";
import { isFullAccess, isStaff } from "@/lib/roles";
import { countPendingParentRequests } from "@/lib/student-instructions";
import { todayKST } from "@/lib/utils";

// 입회 대기 신청·문의는 "봤음" 칸이 없어 직원마다 대기자 화면을 마지막으로 연 시각을 AppSetting 에 둔다
const waitlistSeenKey = (userId: string) => `waitlist.seenAt:${userId}`;
// 이 배지를 켠 날 — 대기자 화면을 한 번도 안 연 직원에게 지난 신청 전부를 새 건으로 띄우지 않는다
const WAITLIST_BADGE_SINCE = new Date("2026-11-17T00:00:00+09:00");

/** 대기자 관리 화면을 열면 호출 — 그때까지 들어온 신청·문의는 이 직원에게 더 이상 새 건이 아니다 */
export async function markWaitlistSeen(userId: string) {
  const key = waitlistSeenKey(userId);
  const value = new Date().toISOString();
  await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

async function countNewWaitlist(userId: string) {
  const seen = await prisma.appSetting.findUnique({
    where: { key: waitlistSeenKey(userId) },
    select: { value: true },
  });
  const since = seen ? new Date(seen.value) : WAITLIST_BADGE_SINCE;
  // 공개 폼으로 들어온 건만 WAITING 으로 시작한다 (직원 일괄 등록은 ENROLLED)
  return prisma.waitlist.count({ where: { status: "WAITING", createdAt: { gt: since } } });
}

/**
 * 사이드바 미확인 배지 전체 집계 — (dashboard)·/online 레이아웃과
 * /api/sidebar-badges 폴링이 공유하는 단일 소스.
 * 항목별 실패는 해당 배지만 생략 (레이아웃 렌더 차단 금지).
 */
export async function getSidebarBadges(
  userId: string,
  role?: string | null,
): Promise<Record<string, number>> {
  const staff = isStaff(role);
  const [requests, suggestions, questions, chats, proposals, examApps, lunchRequests, parentFeedback, staffDm, reports, tuitionOnsite, familyChats, parentRequests, approvals, redemptions, waitlist] =
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
      // /lunch — 미답변 학부모 변경 요청 + 학부모가 "입금했어요" 했는데 아직 확인 전인 주문
      Promise.all([
        prisma.lunchChangeRequest.count({
          where: { reply: null, student: { status: "ACTIVE" } },
        }),
        prisma.lunchOrder.count({
          where: { paidStatus: "PENDING", depositClaimedAt: { not: null }, student: { status: "ACTIVE" } },
        }),
      ]).then(([changes, deposits]) => changes + deposits),
      // /online/reports — 학부모 피드백 미확인 (원장만)
      isFullAccess(role)
        ? prisma.onlineParentFeedback.count({ where: { readAt: null } })
        : Promise.resolve(0),
      // /staff-messages — 직원 DM 중 내가 안 읽은 메시지 수
      prisma.staffThreadMessage.count({
        where: {
          readAt: null,
          senderId: { not: userId },
          thread: { OR: [{ aUserId: userId }, { bUserId: userId }] },
        },
      }),
      // /moderation — 처리 대기 신고 (원장만)
      isFullAccess(role)
        ? prisma.contentReport.count({ where: { status: "OPEN" } })
        : Promise.resolve(0),
      // /tuition — 직원 확인을 기다리는 현장 결제 신청 (자습실 직원 전체)
      isStaff(role)
        ? prisma.tuitionPayment.count({ where: { status: "ONSITE_REQUESTED" } })
        : Promise.resolve(0),
      // /family-chat — 학생·학부모 글을 운영진 아무도 아직 안 본 방 (직원 전체 공동 읽음)
      countStaffUnreadFamilyChats(),
      // /instructions — 아직 처리 안 한 학부모 요청 (직원 전체 공동)
      countPendingParentRequests(),
      // /approvals — 승인 대기 쪽잠(오늘 이후)·네트워크 사용 신청 (운영진 앱 신청함과 같은 기준)
      staff
        ? Promise.all([
            prisma.napRequest.count({ where: { status: "PENDING", date: { gte: todayKST() } } }),
            prisma.networkRequest.count({ where: { status: "PENDING" } }),
          ]).then(([naps, networks]) => naps + networks)
        : Promise.resolve(0),
      // /merit-demerit — 승인 대기 포인트 상점 교환 신청
      staff ? prisma.rewardRedemption.count({ where: { status: "PENDING" } }) : Promise.resolve(0),
      // /waitlist — 이 직원이 대기자 화면을 마지막으로 연 뒤 들어온 입회 대기 신청·문의
      staff ? countNewWaitlist(userId) : Promise.resolve(0),
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
  set("/staff-messages", staffDm);
  set("/moderation", reports);
  set("/tuition", tuitionOnsite);
  set("/family-chat", familyChats);
  set("/instructions", parentRequests);
  set("/approvals", approvals);
  set("/merit-demerit", redemptions);
  set("/waitlist", waitlist);

  return badges;
}
