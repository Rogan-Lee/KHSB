// 영단어 온라인 시험 — 직원용 배정·링크 재발급 핵심 로직.
// 웹 서버 액션(src/actions/vocab-online.ts)과 모바일 API(src/lib/mobile-staff-vocab.ts)가 같이 쓴다.
// 인증·권한 검사와 revalidatePath 는 호출 측 책임.

import { prisma } from "@/lib/prisma";
import { vocabExpiresAt } from "@/lib/token-auth";
import { newShuffleSeed } from "@/lib/vocab-shuffle";

export class VocabAdminCoreError extends Error {}

/** 시험을 학생들에게 배정. 이미 응시본이 있는 학생은 건너뛴다. */
export async function assignVocabExam(params: {
  examId: string;
  studentIds: string[];
  assignedById: string;
}) {
  const exam = await prisma.vocabExam.findUnique({
    where: { id: params.examId },
    select: { id: true, questionCount: true },
  });
  if (!exam) throw new VocabAdminCoreError("시험을 찾을 수 없습니다");

  const existing = await prisma.vocabAttempt.findMany({
    where: { examId: params.examId, studentId: { in: params.studentIds } },
    select: { studentId: true },
  });
  const skip = new Set(existing.map((e) => e.studentId));
  const targets = params.studentIds.filter((id) => !skip.has(id));
  for (const studentId of targets) {
    await prisma.vocabAttempt.create({
      data: {
        examId: params.examId,
        studentId,
        assignedById: params.assignedById,
        totalQuestions: exam.questionCount,
        expiresAt: vocabExpiresAt(),
        shuffleSeed: newShuffleSeed(),
      },
    });
  }
  return { added: targets.length, skipped: skip.size };
}

/** 응시 링크 재발급 — 새 토큰·만료일·셔플 시드, 기존 응시 문항은 폐기(처음부터 다시). */
export async function reissueVocabAttemptLink(attemptId: string) {
  const updated = await prisma.vocabAttempt.update({
    where: { id: attemptId },
    data: {
      token: crypto.randomUUID(),
      status: "ASSIGNED",
      startedAt: null,
      expiresAt: vocabExpiresAt(),
      // 재발급은 새 시도이므로 새 시드 발급 → 순서도 새로
      shuffleSeed: newShuffleSeed(),
    },
    select: { token: true, expiresAt: true },
  });
  // 기존 응시 문항 폐기 (재시작)
  await prisma.vocabAttemptItem.deleteMany({ where: { attemptId } });
  return updated;
}
