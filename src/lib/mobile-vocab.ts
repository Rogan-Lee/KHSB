import {
  finalizeVocabAttempt,
  startVocabAttempt,
  submitVocabAnswer,
} from "@/actions/vocab-online";
import { MobileApiError } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

/**
 * 모바일 단어시험 — 학생 세션 인증 기반 래퍼.
 *
 * 기존 학생 응시 로직(`src/actions/vocab-online.ts`)은 응시 토큰(`/v/[token]`)만으로
 * 동작하고 학생 신원을 검증하지 않는다. 모바일은 세션 인증이므로
 * 여기서 attempt 소유권(studentId)을 먼저 확인한 뒤 토큰으로 동일 로직을 재사용한다.
 */

type OwnedAttempt = { id: string; token: string; status: string };

async function ownedAttempt(
  studentId: string,
  attemptId: string,
): Promise<OwnedAttempt> {
  const attempt = await prisma.vocabAttempt.findFirst({
    where: { id: attemptId, studentId },
    select: { id: true, token: true, status: true },
  });
  if (!attempt) throw new MobileApiError("시험을 찾을 수 없습니다", 404);
  return attempt;
}

/** 사용자 안내용 한국어 메시지인지 (Prisma 등 내부 오류 문구는 그대로 내보내지 않는다) */
const USER_FACING_MESSAGE = /[가-힣]/;

/**
 * 기존 토큰 기반 액션의 plain Error 를 모바일 에러로 변환.
 * 액션이 던지는 한국어 안내 문구만 409 로 전달하고, 그 외(DB·런타임 오류)는 그대로 던져
 * mobileApiErrorResponse 가 로그만 남기고 일반 500 문구로 응답하게 한다.
 */
async function viaToken<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof MobileApiError) throw error;
    if (
      error instanceof Error &&
      !error.name.startsWith("PrismaClient") &&
      USER_FACING_MESSAGE.test(error.message)
    ) {
      throw new MobileApiError(error.message, 409);
    }
    throw error;
  }
}

const MAX_ANSWER_LEN = 200;
const MAX_ANSWER_TIME_MS = 60 * 60 * 1000;

function statusLabel(status: string): string {
  return (
    {
      ASSIGNED: "응시 전",
      IN_PROGRESS: "진행 중",
      SUBMITTED: "완료",
      EXPIRED: "만료",
    }[status] ?? status
  );
}

/** 제출 전인데 응시 기한이 지났는지 (EXPIRED 로 아직 전이되지 않은 응시 걸러내기용) */
function isPastDue(status: string, expiresAt: Date | null, now = Date.now()): boolean {
  return status !== "SUBMITTED" && !!expiresAt && expiresAt.getTime() <= now;
}

/**
 * 학생의 단어시험 목록(최신 배정순).
 * 웹 포털(/s/[token]/vocab)과 같게 — 만료·취소(EXPIRED)와 기한이 지난 미제출 응시는 뺀다.
 */
export async function getMobileVocabList(studentId: string) {
  const attempts = await prisma.vocabAttempt.findMany({
    where: { studentId, status: { not: "EXPIRED" } },
    orderBy: { assignedAt: "desc" },
    take: 100,
    select: {
      id: true,
      status: true,
      score: true,
      correctCount: true,
      totalQuestions: true,
      assignedAt: true,
      submittedAt: true,
      expiresAt: true,
      exam: {
        select: { title: true, questionCount: true, perQuestionSeconds: true },
      },
    },
  });

  const now = Date.now();
  const items = attempts
    .filter((a) => !isPastDue(a.status, a.expiresAt, now))
    .map((a) => ({
      id: a.id,
      title: a.exam.title,
      status: a.status,
      statusLabel: statusLabel(a.status),
      questionCount: a.exam.questionCount,
      perQuestionSeconds: a.exam.perQuestionSeconds,
      score: a.score,
      correctCount: a.correctCount,
      totalQuestions: a.totalQuestions,
      assignedAt: a.assignedAt.toISOString(),
      submittedAt: a.submittedAt ? a.submittedAt.toISOString() : null,
      expiresAt: a.expiresAt ? a.expiresAt.toISOString() : null,
    }));

  return {
    items,
    summary: {
      todo: items.filter((i) => i.status === "ASSIGNED").length,
      inProgress: items.filter((i) => i.status === "IN_PROGRESS").length,
      done: items.filter((i) => i.status === "SUBMITTED").length,
    },
  };
}

/** 응시 시작(또는 이어서 풀기). 문항 목록(정답 미포함) 반환. */
export async function startMobileVocab(studentId: string, attemptId: string) {
  const attempt = await ownedAttempt(studentId, attemptId);
  const state = await viaToken(() => startVocabAttempt(attempt.token));
  return { attemptId, ...state };
}

/** 단일 문항 답안 저장(즉시 채점은 서버 내부에서만). */
export async function answerMobileVocab(
  studentId: string,
  attemptId: string,
  itemId: string,
  answer: string,
  timeMs: number,
) {
  const attempt = await ownedAttempt(studentId, attemptId);
  // 답안 길이·소요 시간 상한 (DB Int 범위 초과·과대 입력 방지)
  const safeAnswer = String(answer ?? "").slice(0, MAX_ANSWER_LEN);
  const safeTimeMs = Math.min(
    Math.max(0, Math.floor(Number(timeMs)) || 0),
    MAX_ANSWER_TIME_MS,
  );
  await viaToken(() =>
    submitVocabAnswer(attempt.token, itemId, safeAnswer, safeTimeMs),
  );
  return { ok: true };
}

/** 응시 제출(채점 확정). 점수 요약 반환. */
export async function finalizeMobileVocab(
  studentId: string,
  attemptId: string,
) {
  const attempt = await ownedAttempt(studentId, attemptId);
  const result = await viaToken(() => finalizeVocabAttempt(attempt.token));
  return { attemptId, ...result };
}

/**
 * 응시 하나 — 인트로(시험 정보)와 결과를 한 번에.
 * 문항별 정답·내 답(items)은 제출 완료(SUBMITTED)일 때만 채운다(응시 중 정답 노출 방지).
 * 기한이 지난 미제출 응시는 status 를 EXPIRED 로 내려준다(실제 전이는 응시 시작 시 기존 로직이 처리).
 */
export async function getMobileVocabResult(
  studentId: string,
  attemptId: string,
) {
  const attempt = await prisma.vocabAttempt.findFirst({
    where: { id: attemptId, studentId },
    select: {
      id: true,
      status: true,
      score: true,
      correctCount: true,
      totalQuestions: true,
      assignedAt: true,
      submittedAt: true,
      expiresAt: true,
      durationMs: true,
      student: { select: { name: true } },
      exam: {
        select: { title: true, questionCount: true, perQuestionSeconds: true },
      },
    },
  });
  if (!attempt) throw new MobileApiError("시험을 찾을 수 없습니다", 404);

  const status = isPastDue(attempt.status, attempt.expiresAt)
    ? "EXPIRED"
    : attempt.status;
  const submitted = status === "SUBMITTED";

  const items = submitted
    ? await prisma.vocabAttemptItem.findMany({
        where: { attemptId: attempt.id },
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          direction: true,
          prompt: true,
          word: true,
          meanings: true,
          studentAnswer: true,
          isCorrect: true,
        },
      })
    : [];

  return {
    id: attempt.id,
    title: attempt.exam.title,
    status,
    statusLabel: statusLabel(status),
    studentName: attempt.student.name,
    questionCount: attempt.exam.questionCount,
    perQuestionSeconds: attempt.exam.perQuestionSeconds,
    assignedAt: attempt.assignedAt.toISOString(),
    expiresAt: attempt.expiresAt ? attempt.expiresAt.toISOString() : null,
    score: attempt.score,
    correctCount: attempt.correctCount,
    totalQuestions: attempt.totalQuestions,
    submittedAt: attempt.submittedAt ? attempt.submittedAt.toISOString() : null,
    durationMs: attempt.durationMs,
    items: items.map((item) => ({
      id: item.id,
      order: item.order,
      direction: item.direction === "KO_TO_EN" ? "KO_TO_EN" : "EN_TO_KO",
      prompt: item.prompt,
      word: item.word,
      meanings: item.meanings,
      studentAnswer: item.studentAnswer,
      isCorrect: item.isCorrect,
      // 정답 표기: EN_TO_KO 는 뜻, KO_TO_EN 은 단어
      answer: item.direction === "KO_TO_EN" ? item.word : item.meanings.join(", "),
    })),
  };
}
