"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  addStudentQuestionMessage,
  markStudentQuestionRead,
} from "@/actions/student-questions";
import { QuestionThread, type ThreadMessage } from "@/components/questions/question-thread";

export function StudentQuestionThread({
  token,
  questionId,
  messages,
  hasUnread,
}: {
  token: string;
  questionId: string;
  messages: ThreadMessage[];
  hasUnread: boolean;
}) {
  const router = useRouter();
  const fired = useRef(false);

  useEffect(() => {
    if (!hasUnread || fired.current) return;
    fired.current = true;
    markStudentQuestionRead({ studentToken: token, questionId })
      .then(() => router.refresh())
      .catch(() => {});
  }, [token, questionId, hasUnread, router]);

  return (
    <QuestionThread
      viewer="STUDENT"
      messages={messages}
      studentToken={token}
      composerPlaceholder="추가로 물어보거나 답변에 답글을 남겨보세요 (⌘+Enter 전송)"
      composerLabel="보내기"
      uploaderLabel="사진 추가"
      emptyHint="첫 메시지를 작성해 보세요."
      onSend={async ({ content, attachments }) => {
        await addStudentQuestionMessage({
          studentToken: token,
          questionId,
          content,
          attachments,
        });
      }}
    />
  );
}
