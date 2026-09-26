import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { countUnseenSuggestionUpdates } from "@/lib/suggestion-handling";

/** 학생 측 미확인 채팅 메시지 합계 (모든 담당자 채팅방 합산). */
async function countUnreadChatMessagesForStudent(studentId: string): Promise<number> {
  const chats = await prisma.portalChat.findMany({
    where: { studentId },
    select: { id: true, studentReadAt: true },
  });
  if (chats.length === 0) return 0;
  const counts = await Promise.all(
    chats.map((c) =>
      prisma.portalChatMessage.count({
        where: {
          chatId: c.id,
          senderType: "STAFF",
          createdAt: c.studentReadAt ? { gt: c.studentReadAt } : undefined,
        },
      })
    )
  );
  return counts.reduce((a, b) => a + b, 0);
}

/** 학생 측 미확인 질문 답변 합계 (모든 질문 합산). */
async function countUnreadQuestionAnswersForStudent(studentId: string): Promise<number> {
  const questions = await prisma.studentQuestion.findMany({
    where: { studentId },
    select: { id: true, studentReadAt: true },
  });
  if (questions.length === 0) return 0;
  const counts = await Promise.all(
    questions.map((q) =>
      prisma.questionMessage.count({
        where: {
          questionId: q.id,
          senderType: "STAFF",
          createdAt: q.studentReadAt ? { gt: q.studentReadAt } : undefined,
        },
      })
    )
  );
  return counts.reduce((a, b) => a + b, 0);
}

export type PortalBadgeCounts = {
  tasks: number;
  feedback: number;
  chat: number;
  vocab: number;
  hasVocab: boolean;
  qna: number;
  suggestions: number;
};

/**
 * 학생 포털 알림 배지 카운트. layout(탭바)과 전체 탭 페이지가 같은 요청 안에서
 * 공유하도록 React cache 로 감싼다.
 */
export const getPortalBadgeCounts = cache(
  async (studentId: string): Promise<PortalBadgeCounts> => {
    const [tasks, feedback, chat, vocabTotal, vocab, qna, suggestions] = await Promise.all([
      prisma.performanceTask.count({
        where: { studentId, status: { in: ["OPEN", "IN_PROGRESS", "NEEDS_REVISION"] } },
      }),
      prisma.taskFeedback.count({
        where: { readByStudentAt: null, submission: { task: { studentId } } },
      }),
      countUnreadChatMessagesForStudent(studentId),
      prisma.vocabAttempt.count({ where: { studentId } }),
      prisma.vocabAttempt.count({
        where: { studentId, status: { in: ["ASSIGNED", "IN_PROGRESS"] } },
      }),
      countUnreadQuestionAnswersForStudent(studentId),
      countUnseenSuggestionUpdates(studentId),
    ]);
    return { tasks, feedback, chat, vocab, hasVocab: vocabTotal > 0, qna, suggestions };
  }
);
