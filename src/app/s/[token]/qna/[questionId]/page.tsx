import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { validateMagicLink } from "@/lib/student-auth";
import { getStudentQuestionThread } from "@/actions/student-questions";
import { StudentQuestionThread } from "../_components/student-question-thread";
import type { StudentQuestionStatus } from "@/generated/prisma";

const STATUS_LABEL: Record<StudentQuestionStatus, string> = {
  OPEN: "답변 대기",
  ANSWERED: "답변 완료",
  RESOLVED: "해결됨",
  ARCHIVED: "보관됨",
};
const STATUS_TONE: Record<StudentQuestionStatus, string> = {
  OPEN: "bg-warn-soft text-warn-ink",
  ANSWERED: "bg-ok-soft text-ok-ink",
  RESOLVED: "bg-canvas-2 text-ink-3",
  ARCHIVED: "bg-canvas-2 text-ink-4",
};

export default async function StudentQuestionDetailPage({
  params,
}: {
  params: Promise<{ token: string; questionId: string }>;
}) {
  const { token, questionId } = await params;
  const session = await validateMagicLink(token);
  if (!session) redirect("/s/expired");

  let thread;
  try {
    thread = await getStudentQuestionThread({ studentToken: token, questionId });
  } catch {
    notFound();
  }
  const { question, messages, hasUnread } = thread;

  return (
    <div className="space-y-4">
      <Link
        href={`/s/${token}/qna`}
        className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-4 active:text-ink-2"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
        질문 목록
      </Link>

      <div>
        <div className="flex items-center gap-1.5">
          {question.subject && (
            <span className="rounded-full bg-canvas-2 px-2 py-0.5 text-[10.5px] font-medium text-ink-3">
              {question.subject}
            </span>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${STATUS_TONE[question.status]}`}
          >
            {STATUS_LABEL[question.status]}
          </span>
        </div>
        <h1 className="mt-1.5 text-[18px] font-bold leading-snug tracking-[-0.01em] text-ink">
          {question.title}
        </h1>
      </div>

      <StudentQuestionThread
        token={token}
        questionId={questionId}
        messages={messages}
        hasUnread={hasUnread}
      />
    </div>
  );
}
