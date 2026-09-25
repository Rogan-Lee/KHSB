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
import { Button } from "@/components/ui/button";
import { DescriptionList, PageHeader, Section, StatusBadge, type Tone } from "@/components/backoffice/ui";

const STATUS_LABEL: Record<StudentQuestionStatus, string> = {
  OPEN: "미답변",
  ANSWERED: "답변함",
  RESOLVED: "해결됨",
  ARCHIVED: "보관",
};
const STATUS_TONE: Record<StudentQuestionStatus, Tone> = {
  OPEN: "warn",
  ANSWERED: "ok",
  RESOLVED: "gray",
  ARCHIVED: "gray",
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

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

  const studentLine = `${question.student.name} · ${question.student.grade}${
    question.student.school ? ` · ${question.student.school}` : ""
  }`;

  return (
    <>
      <PageHeader
        back={{ href: "/questions", label: "학생 질문 목록" }}
        title={question.title}
        meta={
          <>
            <StatusBadge tone={STATUS_TONE[question.status]} size="large">
              {STATUS_LABEL[question.status]}
            </StatusBadge>
            {question.subject && (
              <StatusBadge tone="gray" size="large">
                {question.subject}
              </StatusBadge>
            )}
          </>
        }
        description={`${studentLine} · ${fmt(question.createdAt)} 질문`}
        actions={
          <>
            {isPending && <Loader2 className="size-4 animate-spin text-fg-neutral-subtle" aria-label="처리 중" />}
            {question.status !== "ARCHIVED" && (
              <Button
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={() =>
                  run(
                    () => setStudentQuestionStatus({ questionId, status: "ARCHIVED" }),
                    "보관했어요"
                  )
                }
              >
                <Archive />
                보관
              </Button>
            )}
            {question.status !== "RESOLVED" && (
              <Button
                variant="secondary"
                size="sm"
                disabled={isPending}
                onClick={() =>
                  run(
                    () => setStudentQuestionStatus({ questionId, status: "RESOLVED" }),
                    "해결 처리했어요"
                  )
                }
              >
                <CheckCircle2 />
                해결 표시
              </Button>
            )}
            {question.status === "RESOLVED" && (
              <Button
                variant="secondary"
                size="sm"
                disabled={isPending}
                onClick={() =>
                  run(
                    () => setStudentQuestionStatus({ questionId, status: "OPEN" }),
                    "다시 열었어요"
                  )
                }
              >
                <RotateCcw />
                다시 열기
              </Button>
            )}
            {question.claimedByMe ? (
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => run(() => releaseStudentQuestion({ questionId }), "담당을 해제했어요")}
              >
                <UserX />
                담당 해제
              </Button>
            ) : (
              <Button
                size="sm"
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
              >
                <UserCheck />
                담당하기
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 items-start gap-x6 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Thread + answer composer */}
        <Section title="대화" count={messages.length}>
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
        </Section>

        <Section title="질문 정보" className="lg:sticky lg:top-4">
          <DescriptionList
            cols={1}
            items={[
              { label: "학생", value: studentLine },
              { label: "과목", value: question.subject ?? "—" },
              {
                label: "상태",
                value: (
                  <StatusBadge tone={STATUS_TONE[question.status]}>{STATUS_LABEL[question.status]}</StatusBadge>
                ),
              },
              {
                label: "담당",
                value: question.claimedBy ? (
                  <span className="inline-flex items-center gap-x1_5">
                    <StatusBadge tone={question.claimedByMe ? "brand" : "gray"}>
                      <UserCheck />
                      {question.claimedByMe ? "내가 담당 중" : `${question.claimedBy.name} 담당 중`}
                    </StatusBadge>
                  </span>
                ) : (
                  <span className="text-fg-neutral-subtle">아직 담당자가 없어요</span>
                ),
              },
              ...(question.claimedAt
                ? [{ label: "담당 시작", value: <span className="tabular-nums">{fmt(question.claimedAt)}</span> }]
                : []),
              { label: "질문 등록", value: <span className="tabular-nums">{fmt(question.createdAt)}</span> },
            ]}
          />
        </Section>
      </div>
    </>
  );
}
