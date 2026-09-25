import { countUnseenSuggestionUpdates } from "@/actions/student-suggestions";
import { countNewParentReports } from "@/lib/mobile-parent-reports";
import { prisma } from "@/lib/prisma";
import { getSidebarBadges } from "@/lib/sidebar-badges";
import { todayKST } from "@/lib/utils";

// 모바일 탭바·홈 배지 집계. 항목별 실패는 0 으로 처리(배지 때문에 화면이 막히지 않게).

const settled = (r: PromiseSettledResult<number>) => (r.status === "fulfilled" ? r.value : 0);

// ─── 학생 — 웹 학생 포털(getPortalBadgeCounts)과 같은 기준 ───────────────

async function unreadChatForStudent(studentId: string) {
  const chats = await prisma.portalChat.findMany({
    where: { studentId },
    select: { id: true, studentReadAt: true },
  });
  const counts = await Promise.all(
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
  return counts.reduce((a, b) => a + b, 0);
}

async function unreadAnswersForStudent(studentId: string) {
  const questions = await prisma.studentQuestion.findMany({
    where: { studentId },
    select: { id: true, studentReadAt: true },
  });
  const counts = await Promise.all(
    questions.map((q) =>
      prisma.questionMessage.count({
        where: {
          questionId: q.id,
          senderType: "STAFF",
          createdAt: q.studentReadAt ? { gt: q.studentReadAt } : undefined,
        },
      }),
    ),
  );
  return counts.reduce((a, b) => a + b, 0);
}

export type StudentBadges = {
  tasks: number;
  feedback: number;
  chat: number;
  vocab: number;
  hasVocab: boolean;
  qna: number;
  suggestions: number;
  /** 전체 탭 점 배지 — 피드백·영단어·건의 합 */
  menu: number;
};

export async function getStudentBadges(studentId: string): Promise<StudentBadges> {
  const [tasks, feedback, chat, vocabTotal, vocab, qna, suggestions] = await Promise.allSettled([
    prisma.performanceTask.count({
      where: { studentId, status: { in: ["OPEN", "IN_PROGRESS", "NEEDS_REVISION"] } },
    }),
    prisma.taskFeedback.count({
      where: { readByStudentAt: null, submission: { task: { studentId } } },
    }),
    unreadChatForStudent(studentId),
    prisma.vocabAttempt.count({ where: { studentId } }),
    // 기한이 지난 미제출 시험은 목록에서 빠지므로 배지에서도 제외
    prisma.vocabAttempt.count({
      where: {
        studentId,
        status: { in: ["ASSIGNED", "IN_PROGRESS"] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    }),
    unreadAnswersForStudent(studentId),
    countUnseenSuggestionUpdates(studentId),
  ]);
  const b = {
    tasks: settled(tasks),
    feedback: settled(feedback),
    chat: settled(chat),
    vocab: settled(vocab),
    hasVocab: settled(vocabTotal) > 0,
    qna: settled(qna),
    suggestions: settled(suggestions),
  };
  return { ...b, menu: b.feedback + b.vocab + b.suggestions };
}

// ─── 직원 ──────────────────────────────────────────────────────────────

export type StaffBadges = {
  /** 소통 탭 — 미확인 질문 + 미확인 채팅방 + 직원 DM */
  inbox: number;
  questions: number;
  chats: number;
  dm: number;
  /** 승인 대기 — 쪽잠·네트워크·포인트 교환·모의고사 신청 */
  approvals: number;
  lunchRequests: number;
  suggestions: number;
  /** 홈 탭 점 배지 */
  home: number;
  mentoring: number;
  /** 전체 탭 점 배지 */
  menu: number;
};

export async function getStaffBadges(userId: string, role: string): Promise<StaffBadges> {
  const today = todayKST();
  const [sidebar, naps, network, redemptions] = await Promise.allSettled([
    getSidebarBadges(userId, role),
    prisma.napRequest.count({ where: { status: "PENDING", date: { gte: today } } }),
    prisma.networkRequest.count({ where: { status: "PENDING" } }),
    prisma.rewardRedemption.count({ where: { status: "PENDING" } }),
  ]);
  const sb = sidebar.status === "fulfilled" ? sidebar.value : {};
  const questions = sb["/questions"] ?? 0;
  const chats = sb["/online/inbox"] ?? 0;
  const dm = sb["/messages"] ?? 0;
  const approvals = settled(naps) + settled(network) + settled(redemptions) + (sb["/exams"] ?? 0);
  const lunchRequests = sb["/lunch"] ?? 0;
  const suggestions = sb["/suggestions"] ?? 0;
  return {
    inbox: questions + chats + dm,
    questions,
    chats,
    dm,
    approvals,
    lunchRequests,
    suggestions,
    home: approvals + lunchRequests,
    mentoring: 0,
    menu: suggestions + (sb["/online/schedules"] ?? 0) + (sb["/online/reports"] ?? 0),
  };
}

// ─── 학부모 ────────────────────────────────────────────────────────────

export type ParentBadges = {
  /** 최근 7일 안에 새로 나온 리포트 수 (자녀 합) */
  reports: number;
  menu: number;
};

export async function getParentBadges(studentIds: string[]): Promise<ParentBadges> {
  // 리포트함(멘토링·월간·온라인·공부 계획·상담)의 "새 리포트" 와 같은 규칙 — src/lib/mobile-parent-reports.ts
  const now = new Date();
  const [reports, proposals] = await Promise.allSettled([
    countNewParentReports(studentIds),
    // 전체 탭 점 배지 — 학부모 승인을 기다리는 등원 스케줄 제안 (mobile-parent-schedule.ts 와 같은 조건)
    prisma.scheduleProposal.count({
      where: {
        studentId: { in: studentIds },
        status: "PROPOSED",
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    }),
  ]);
  return { reports: settled(reports), menu: settled(proposals) };
}
