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

/** 기존 토큰 기반 액션의 plain Error 를 모바일 에러로 변환. */
async function viaToken<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof MobileApiError) throw error;
    const message =
      error instanceof Error ? error.message : "요청을 처리하지 못했습니다";
    throw new MobileApiError(message, 409);
  }
}

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

/** 학생의 단어시험 목록(만료 제외, 최신순). */
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
      exam: {
        select: { title: true, questionCount: true, perQuestionSeconds: true },
      },
    },
  });

  const items = attempts.map((a) => ({
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
  await viaToken(() =>
    submitVocabAnswer(attempt.token, itemId, answer, timeMs),
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

/** 제출 완료 응시의 결과 상세(문항별 정답/오답 + 내 답). */
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
      submittedAt: true,
      durationMs: true,
      exam: { select: { title: true, direction: true } },
      items: {
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
      },
    },
  });
  if (!attempt) throw new MobileApiError("시험을 찾을 수 없습니다", 404);

  return {
    id: attempt.id,
    title: attempt.exam.title,
    status: attempt.status,
    score: attempt.score,
    correctCount: attempt.correctCount,
    totalQuestions: attempt.totalQuestions,
    submittedAt: attempt.submittedAt ? attempt.submittedAt.toISOString() : null,
    durationMs: attempt.durationMs,
    items: attempt.items.map((item) => ({
      id: item.id,
      order: item.order,
      direction: item.direction,
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
