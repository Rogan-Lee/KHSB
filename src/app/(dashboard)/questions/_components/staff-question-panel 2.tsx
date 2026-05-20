"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserCheck, UserX, Loader2, CheckCircle2, Archive, RotateCcw } from "lucide-react";
import {
  answerStudentQuestion,
  claimStudentQuestion,
  releaseStudentQuestion,
  setStudentQuestionStatus,
} from "@/actions/student-questions";
import { QuestionThread, type ThreadMessage } from "@/components/questions/question-thread";
import type { StudentQuestionStatus } from "@/generated/prisma";

const STATUS_LABEL: Record<StudentQuestionStatus, string> = {
  OPEN: "미답변",
  ANSWERED: "답변함",
  RESOLVED: "해결됨",
  ARCHIVED: "보관",
};
const STATUS_TONE: Record<StudentQuestionStatus, string> = {
  OPEN: "bg-amber-100 text-amber-800",
  ANSWERED: "bg-emerald-100 text-emerald-800",
  RESOLVED: "bg-slate-100 text-slate-600",
  ARCHIVED: "bg-slate-100 text-slate-500",
};

type Question = {
  id: string;
  title: string;
  subject: string | null;
  status: StudentQuestionStatus;
  createdAt: string;
  student: { id: string; name: string; grade: string; school: string | null };
  claimedBy: { id: string; name: string } | null;
  claimedByMe: boolean;
  claimedAt: string | null;
};

export function StaffQuestionPanel({
  questionId,
  question,
  messages,
}: {
  questionId: string;
  question: Question;
  messages: ThreadMessage[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const run = (fn: () => Promise<unknown>, successMsg?: string) => {
    startTransition(async () => {
      try {
        await fn();
        if (successMsg) toast.success(successMsg);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "처리에 실패했어요");
      }
    });
  };

  return (
    <div className="mt-4 space-y-4">
      {/* Header */}
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[question.status]}`}
          >
            {STATUS_LABEL[question.status]}
          </span>
          {question.subject && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {question.subject}
            </span>
          )}
          <span className="text-sm font-medium">{question.student.name}</span>
          <span className="text-[12px] text-muted-foreground">
            {question.student.grade}
            {question.student.school ? ` · ${question.student.school}` : ""}
          </span>
          {question.claimedBy && (
            <span
              className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                question.claimedByMe ? "bg-brand/10 text-brand" : "bg-slate-100 text-slate-600"
              }`}
            >
              <UserCheck className="h-3 w-3" />
              {question.claimedByMe ? "내가 담당 중" : `${question.claimedBy.name} 담당 중`}
            </span>
          )}
        </div>
        <h1 className="mt-2 text-lg font-bold leading-snug">{question.title}</h1>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {question.claimedByMe ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => releaseStudentQuestion({ questionId }), "담당을 해제했어요")}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium hover:bg-accent disabled:opacity-60"
            >
              <UserX className="h-3.5 w-3.5" />
              담당 해제
            </button>
          ) : (
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                run(async () => {
                  const r = await claimStudentQuestion({ questionId });
                  if (r.previousClaimerName) {
                    toast.warning(`${r.previousClaimerName}님이 담당 중이던 질문을 가져왔어요`);
                  } else {
                    toast.success("내가 담당으로 지정했어요");
                  }
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-brand/90 disabled:opacity-60"
            >
              <UserCheck className="h-3.5 w-3.5" />
              담당하기
            </button>
          )}

          {question.status !== "RESOLVED" && (
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                run(
                  () => setStudentQuestionStatus({ questionId, status: "RESOLVED" }),
                  "해결 처리했어요"
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium hover:bg-accent disabled:opacity-60"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              해결 표시
            </button>
          )}
          {question.status === "RESOLVED" && (
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                run(
                  () => setStudentQuestionStatus({ questionId, status: "OPEN" }),
                  "다시 열었어요"
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium hover:bg-accent disabled:opacity-60"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              다시 열기
            </button>
          )}
          {question.status !== "ARCHIVED" && (
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                run(
                  () => setStudentQuestionStatus({ questionId, status: "ARCHIVED" }),
                  "보관했어요"
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium hover:bg-accent disabled:opacity-60"
            >
              <Archive className="h-3.5 w-3.5" />
              보관
            </button>
          )}
          {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      </div>

      {/* Thread + answer composer */}
      <QuestionThread
        viewer="STAFF"
        messages={messages}
        composerPlaceholder="학생에게 보낼 풀이/답변을 작성하세요 (⌘+Enter 전송)"
        composerLabel="답변 등록"
        uploaderLabel="풀이 사진 추가"
        emptyHint="아직 메시지가 없어요."
        onSend={async ({ content, attachments }) => {
          await answerStudentQuestion({ questionId, content, attachments });
        }}
      />
    </div>
  );
}
