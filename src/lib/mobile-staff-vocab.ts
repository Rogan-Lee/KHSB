// 직원 앱 — 영단어 온라인 시험 관리(최근 응시·시험 목록·배정·응시 링크 재발급/공유).
// 배정·재발급 핵심 로직은 src/lib/vocab-admin-core.ts (웹 서버 액션과 공용).

import { z } from "zod";

import type { VocabAttemptStatus, VocabExamDirection } from "@/generated/prisma";
import { getAppUrl } from "@/lib/app-url";
import { MobileApiError } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { assignVocabExam, reissueVocabAttemptLink } from "@/lib/vocab-admin-core";

const DAY_MS = 24 * 60 * 60 * 1000;

const STATUS_LABEL: Record<VocabAttemptStatus, string> = {
  ASSIGNED: "미응시",
  IN_PROGRESS: "응시 중",
  SUBMITTED: "제출 완료",
  EXPIRED: "취소됨",
};

const DIRECTION_LABEL: Record<VocabExamDirection, string> = {
  EN_TO_KO: "영→한",
  KO_TO_EN: "한→영",
  MIXED: "혼합",
};

const assignSchema = z.object({
  studentIds: z
    .array(z.string().trim().min(1).max(64))
    .min(1, "학생을 1명 이상 선택하세요")
    .max(300, "한 번에 300명까지 배정할 수 있어요"),
});

function parseBody<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new MobileApiError(result.error.issues[0]?.message ?? "입력값을 확인하세요", 400);
}

function formatKstMonthDay(date: Date) {
  return date.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });
}

const attemptSelect = {
  id: true,
  token: true,
  status: true,
  score: true,
  correctCount: true,
  totalQuestions: true,
  assignedAt: true,
  startedAt: true,
  submittedAt: true,
  expiresAt: true,
  exam: { select: { id: true, title: true, retakeOfId: true } },
  student: { select: { id: true, name: true, grade: true } },
} as const;

type AttemptRow = {
  id: string;
  token: string;
  status: VocabAttemptStatus;
  score: number | null;
  correctCount: number;
  totalQuestions: number;
  assignedAt: Date;
  startedAt: Date | null;
  submittedAt: Date | null;
  expiresAt: Date | null;
  exam: { id: string; title: string; retakeOfId: string | null };
  student: { id: string; name: string; grade: string };
};

function attemptShareText(row: AttemptRow, url: string) {
  const until = row.expiresAt ? `\n${formatKstMonthDay(row.expiresAt)}까지 응시할 수 있어요.` : "";
  return `${row.student.name} 학생, 영단어 시험 「${row.exam.title}」 응시 링크예요.\n아래 링크를 눌러 바로 시작할 수 있어요.${until}\n\n${url}`;
}

function toAttempt(row: AttemptRow, now: Date) {
  const linkExpired = !!row.expiresAt && row.expiresAt.getTime() <= now.getTime();
  // 취소된 응시는 링크를 내보내지 않는다 (웹과 동일)
  const url = row.status === "EXPIRED" ? null : `${getAppUrl()}/v/${row.token}`;
  return {
    id: row.id,
    examId: row.exam.id,
    examTitle: row.exam.title,
    isRetake: !!row.exam.retakeOfId,
    student: row.student,
    status: row.status,
    statusLabel: STATUS_LABEL[row.status],
    score: row.score,
    correctCount: row.correctCount,
    totalQuestions: row.totalQuestions,
    assignedAt: row.assignedAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    linkExpired,
    /** 재발급 가능 — 제출·취소 전 응시 (웹 결과 보드와 같은 규칙) */
    canReissue: row.status === "ASSIGNED" || row.status === "IN_PROGRESS",
    url,
    shareText: url && !linkExpired && row.status !== "SUBMITTED" ? attemptShareText(row, url) : null,
  };
}

function activityTime(a: { submittedAt: Date | null; startedAt: Date | null; assignedAt: Date }) {
  return (a.submittedAt ?? a.startedAt ?? a.assignedAt).getTime();
}

function average(scores: (number | null)[]) {
  const valid = scores.filter((s): s is number => s != null);
  if (valid.length === 0) return null;
  return Math.round((valid.reduce((sum, s) => sum + s, 0) / valid.length) * 10) / 10;
}

type ExamRow = {
  id: string;
  title: string;
  direction: VocabExamDirection;
  questionCount: number;
  perQuestionSeconds: number;
  createdAt: Date;
  retakeOfId: string | null;
  book: { name: string };
  attempts: { status: VocabAttemptStatus; score: number | null }[];
};

function toExam(e: ExamRow) {
  const submitted = e.attempts.filter((a) => a.status === "SUBMITTED");
  return {
    id: e.id,
    title: e.title,
    bookName: e.book.name,
    direction: e.direction,
    directionLabel: DIRECTION_LABEL[e.direction],
    questionCount: e.questionCount,
    perQuestionSeconds: e.perQuestionSeconds,
    createdAt: e.createdAt.toISOString(),
    isRetake: !!e.retakeOfId,
    assignedCount: e.attempts.length,
    submittedCount: submitted.length,
    waitingCount: e.attempts.filter((a) => a.status === "ASSIGNED" || a.status === "IN_PROGRESS")
      .length,
    avgScore: average(submitted.map((a) => a.score)),
  };
}

const examSelect = {
  id: true,
  title: true,
  direction: true,
  questionCount: true,
  perQuestionSeconds: true,
  createdAt: true,
  retakeOfId: true,
  book: { select: { name: true } },
  attempts: { select: { status: true, score: true } },
} as const;

/** 최근 응시(활동순 80건) + 최근 시험 40건 + 요약 */
export async function getStaffVocabOverview(now = new Date()) {
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const [attemptRows, examRows, waiting, inProgress, weekSubmitted] = await Promise.all([
    prisma.vocabAttempt.findMany({
      orderBy: { assignedAt: "desc" },
      take: 120,
      select: attemptSelect,
    }),
    prisma.vocabExam.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      select: examSelect,
    }),
    prisma.vocabAttempt.count({
      where: { status: "ASSIGNED", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    }),
    prisma.vocabAttempt.count({ where: { status: "IN_PROGRESS" } }),
    prisma.vocabAttempt.findMany({
      where: { status: "SUBMITTED", submittedAt: { gte: weekAgo } },
      select: { score: true },
    }),
  ]);

  const attempts = [...attemptRows]
    .sort((a, b) => activityTime(b) - activityTime(a))
    .slice(0, 80)
    .map((row) => toAttempt(row, now));

  return {
    summary: {
      waiting,
      inProgress,
      submittedThisWeek: weekSubmitted.length,
      avgScoreThisWeek: average(weekSubmitted.map((a) => a.score)),
    },
    attempts,
    exams: examRows.map(toExam),
  };
}

/** 시험 1건 + 배정된 학생별 응시 */
export async function getStaffVocabExam(examId: string, now = new Date()) {
  const exam = await prisma.vocabExam.findUnique({ where: { id: examId }, select: examSelect });
  if (!exam) throw new MobileApiError("시험을 찾을 수 없습니다", 404);
  const attempts = await prisma.vocabAttempt.findMany({
    where: { examId },
    orderBy: { assignedAt: "asc" },
    select: attemptSelect,
  });
  return {
    exam: toExam(exam),
    attempts: attempts.map((row) => toAttempt(row, now)),
  };
}

/** 배정용 학생 목록 — 재원생 전체(웹 배정 대화상자와 같은 정렬), examId 가 있으면 이미 배정된 학생 표시 */
export async function getStaffVocabRoster(examId: string | null) {
  const [students, assigned] = await Promise.all([
    prisma.student.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ isOnlineManaged: "desc" }, { grade: "asc" }, { name: "asc" }],
      select: { id: true, name: true, grade: true, school: true, seat: true, isOnlineManaged: true },
    }),
    examId
      ? prisma.vocabAttempt.findMany({ where: { examId }, select: { studentId: true } })
      : Promise.resolve([] as { studentId: string }[]),
  ]);
  const assignedIds = new Set(assigned.map((a) => a.studentId));
  return {
    students: students.map((s) => ({ ...s, assigned: assignedIds.has(s.id) })),
  };
}

/** 시험을 학생들에게 배정 (이미 배정된 학생은 건너뜀) */
export async function assignStaffVocabExam(
  user: { id: string },
  examId: string,
  input: unknown,
) {
  const data = parseBody(assignSchema, input);
  const exam = await prisma.vocabExam.findUnique({ where: { id: examId }, select: { id: true } });
  if (!exam) throw new MobileApiError("시험을 찾을 수 없습니다", 404);

  const uniqueIds = [...new Set(data.studentIds)];
  const valid = await prisma.student.findMany({
    where: { id: { in: uniqueIds }, status: "ACTIVE" },
    select: { id: true },
  });
  if (valid.length === 0) throw new MobileApiError("배정할 수 있는 학생이 없어요", 400);

  return assignVocabExam({
    examId,
    studentIds: valid.map((s) => s.id),
    assignedById: user.id,
  });
}

/** 응시 링크 재발급 — 제출·취소 전 응시만. 새 링크와 공유 문구를 돌려준다. */
export async function reissueStaffVocabAttempt(attemptId: string, now = new Date()) {
  const attempt = await prisma.vocabAttempt.findUnique({
    where: { id: attemptId },
    select: { status: true },
  });
  if (!attempt) throw new MobileApiError("응시 기록을 찾을 수 없습니다", 404);
  if (attempt.status === "SUBMITTED") {
    throw new MobileApiError("제출을 마친 응시는 재발급할 수 없어요", 409);
  }
  if (attempt.status === "EXPIRED") {
    throw new MobileApiError("취소된 응시는 재발급할 수 없어요", 409);
  }

  await reissueVocabAttemptLink(attemptId);
  const row = await prisma.vocabAttempt.findUnique({
    where: { id: attemptId },
    select: attemptSelect,
  });
  if (!row) throw new MobileApiError("응시 기록을 찾을 수 없습니다", 404);
  return { attempt: toAttempt(row, now) };
}
