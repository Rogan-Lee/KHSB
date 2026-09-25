import type { PerformanceTaskStatus } from "@/generated/prisma/enums";
import { getStudentBadges, type StudentBadges } from "@/lib/mobile-badges";
import {
  SURVEY_SECTIONS,
  isSectionComplete,
  normalizeSectionValue,
  parseGradeNumber,
} from "@/lib/online/survey-template";
import { calcPointBalance, pointsToKrw } from "@/lib/points";
import { prisma } from "@/lib/prisma";
import { todayKST } from "@/lib/utils";

/**
 * 모바일 학생 홈·전체 탭 데이터 — 웹 학생 포털 홈(`/s/[token]/page.tsx`)·전체(`menu/page.tsx`)와
 * 같은 쿼리·규칙. 카드 노출은 온라인/오프라인 구분 없이 데이터 유무로 결정하고,
 * 초기 설문만 온라인 관리 학생 전용이다.
 */

type HomeStudent = {
  id: string;
  name: string;
  grade: string;
  school: string | null;
  isOnlineManaged: boolean;
};

export type MobileStudentHome = {
  student: {
    name: string;
    grade: string;
    school: string | null;
    isOnlineManaged: boolean;
  };
  /** 다가오는 멘토링 (최대 3개, 가까운 순) */
  mentoring: {
    /** 첫 세션이 오늘(KST)인지 */
    isToday: boolean;
    sessions: {
      id: string;
      title: string;
      scheduledAt: string;
      durationMinutes: number;
      hostName: string;
      meetUrl: string | null;
    }[];
  };
  questions: { open: number };
  tasks: {
    total: number;
    done: number;
    open: number;
    next: {
      id: string;
      subject: string;
      title: string;
      dueDate: string;
      status: PerformanceTaskStatus;
    } | null;
  };
  /** 초기 설문 — 온라인 관리 학생만 (그 외 null) */
  survey: { submitted: boolean; filled: number; total: number } | null;
  points: { balance: number; krw: number };
  /** 시즌성 신청 — 점심 도시락 메뉴가 열려 있는지, 접수 중인 모의고사 수 */
  seasonal: { lunchOpen: boolean; examOpenCount: number };
  contentCount: number;
  badges: StudentBadges;
};

/** 오늘 KST 00:00 의 UTC 시각 */
function kstDayStart(now = new Date()): Date {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCHours(0, 0, 0, 0);
  return new Date(kst.getTime() - 9 * 60 * 60 * 1000);
}

export async function getMobileStudentHome(student: HomeStudent): Promise<MobileStudentHome> {
  const isOnline = student.isOnlineManaged;
  const today = todayKST();
  const now = new Date();

  const [
    openQuestions,
    survey,
    taskCounts,
    nextTask,
    upcomingSessions,
    lunchMenuCount,
    examOpenCount,
    contentCount,
    merits,
    redemptions,
    badges,
  ] = await Promise.all([
    prisma.studentQuestion.count({
      where: { studentId: student.id, status: { in: ["OPEN", "ANSWERED"] } },
    }),
    isOnline
      ? prisma.onboardingSurvey.findUnique({
          where: { studentId: student.id },
          select: { submittedAt: true, sections: true },
        })
      : Promise.resolve(null),
    prisma.performanceTask.groupBy({
      by: ["status"],
      where: { studentId: student.id },
      _count: { _all: true },
    }),
    prisma.performanceTask.findFirst({
      where: { studentId: student.id, status: { not: "DONE" } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      select: { id: true, subject: true, title: true, dueDate: true, status: true },
    }),
    prisma.mentoringSession.findMany({
      where: {
        studentId: student.id,
        status: { in: ["SCHEDULED", "IN_PROGRESS"] },
        scheduledAt: { gte: now },
      },
      orderBy: { scheduledAt: "asc" },
      take: 3,
      select: {
        id: true,
        title: true,
        scheduledAt: true,
        durationMinutes: true,
        meetUrl: true,
        host: { select: { name: true } },
      },
    }),
    prisma.lunchMenu.count({ where: { date: { gte: today }, closed: false } }),
    prisma.examSession.count({
      where: { applicationOpen: true, examDate: { gte: today } },
    }),
    prisma.contentPost.count({ where: { visible: true } }),
    prisma.meritDemerit.findMany({
      where: { studentId: student.id },
      select: { type: true, points: true },
    }),
    prisma.rewardRedemption.findMany({
      where: { studentId: student.id },
      select: { status: true, points: true },
    }),
    getStudentBadges(student.id),
  ]);

  const total = taskCounts.reduce((sum, c) => sum + c._count._all, 0);
  const done = taskCounts.find((c) => c.status === "DONE")?._count._all ?? 0;

  const { balance } = calcPointBalance({ merits, redemptions });

  let surveyView: MobileStudentHome["survey"] = null;
  if (isOnline) {
    const sections = (survey?.sections as Record<string, unknown> | null) ?? null;
    const ctx = { gradeNumber: parseGradeNumber(student.grade), now };
    const filled = sections
      ? SURVEY_SECTIONS.filter((s) =>
          isSectionComplete(s, normalizeSectionValue(s, sections[s.key]), ctx),
        ).length
      : 0;
    surveyView = { submitted: !!survey?.submittedAt, filled, total: SURVEY_SECTIONS.length };
  }

  const dayStart = kstDayStart(now);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const first = upcomingSessions[0];
  const isToday = !!first && first.scheduledAt >= dayStart && first.scheduledAt < dayEnd;

  return {
    student: {
      name: student.name,
      grade: student.grade,
      school: student.school,
      isOnlineManaged: isOnline,
    },
    mentoring: {
      isToday,
      sessions: upcomingSessions.map((s) => ({
        id: s.id,
        title: s.title,
        scheduledAt: s.scheduledAt.toISOString(),
        durationMinutes: s.durationMinutes,
        hostName: s.host.name,
        meetUrl: s.meetUrl,
      })),
    },
    questions: { open: openQuestions },
    tasks: {
      total,
      done,
      open: total - done,
      next: nextTask
        ? {
            id: nextTask.id,
            subject: nextTask.subject,
            title: nextTask.title,
            dueDate: nextTask.dueDate.toISOString(),
            status: nextTask.status,
          }
        : null,
    },
    survey: surveyView,
    points: { balance, krw: pointsToKrw(balance) },
    seasonal: { lunchOpen: lunchMenuCount > 0, examOpenCount },
    contentCount,
    badges,
  };
}
