import { notFound, redirect } from "next/navigation";
import { validateMagicLink } from "@/lib/student-auth";
import { getStudentQuestionThread } from "@/actions/student-questions";
import { Badge } from "@/components/portal/ui";
import { QUESTION_STATUS } from "@/components/portal/status";
import { StudentQuestionThread } from "../_components/student-question-thread";

function fmtAsked(iso: string): string {
  const k = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  const h = k.getUTCHours();
  const m = k.getUTCMinutes().toString().padStart(2, "0");
  return `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일 ${h < 12 ? "오전" : "오후"} ${
    h % 12 === 0 ? 12 : h % 12
  }:${m}`;
}

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
  const status = QUESTION_STATUS[question.status];

  return (
    <div className="flex flex-col gap-x6">
      <header className="px-x1 pt-x3">
        <div className="flex flex-wrap items-center gap-x1">
          {question.subject && <Badge>{question.subject}</Badge>}
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <h1 className="mt-x2_5 break-words t8-bold text-fg-neutral">{question.title}</h1>
        <p className="mt-x1_5 t3-regular tabular-nums text-fg-neutral-subtle">
          {fmtAsked(question.createdAt)} 질문
        </p>
      </header>

      <StudentQuestionThread
        token={token}
        questionId={questionId}
        messages={messages}
        hasUnread={hasUnread}
      />
    </div>
  );
}
