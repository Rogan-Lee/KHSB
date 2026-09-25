// 학생 질문(Q&A) 담당·상태 처리 핵심 로직 — 웹 서버 액션(src/actions/student-questions.ts)과
// 모바일 직원 API(src/lib/mobile-staff-questions.ts)가 같이 쓴다.
// 호출 측이 직원 권한을 먼저 검증하고, revalidatePath 도 호출 측 책임.

import type { StudentQuestionStatus } from "@/generated/prisma/enums";
import { MobileApiError } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

/** 답변 담당 잡기 (soft lock — 이미 다른 사람이 잡았어도 가져올 수 있음). */
export async function claimStudentQuestionFor(questionId: string, meId: string) {
  const question = await prisma.studentQuestion.findUnique({
    where: { id: questionId },
    select: { id: true, claimedBy: { select: { id: true, name: true } } },
  });
  if (!question) throw new MobileApiError("질문을 찾을 수 없습니다", 404);
  const previousClaimerName =
    question.claimedBy && question.claimedBy.id !== meId ? question.claimedBy.name : null;

  const updated = await prisma.studentQuestion.update({
    where: { id: question.id },
    data: { claimedById: meId, claimedAt: new Date() },
    select: { claimedBy: { select: { id: true, name: true } } },
  });

  return { previousClaimerName, claimedBy: updated.claimedBy };
}

/** 담당 해제. */
export async function releaseStudentQuestionClaim(questionId: string) {
  await prisma.studentQuestion.update({
    where: { id: questionId },
    data: { claimedById: null, claimedAt: null },
  });
}

/** 질문 상태 변경 (해결됨/보관/다시 열기). */
export async function updateStudentQuestionStatus(
  questionId: string,
  status: StudentQuestionStatus,
) {
  await prisma.studentQuestion.update({
    where: { id: questionId },
    data: { status },
  });
}
