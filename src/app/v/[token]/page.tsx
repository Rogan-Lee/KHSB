import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { VocabExperience } from "./_components/vocab-runner";

export const dynamic = "force-dynamic";

export default async function VocabExamEntryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const attempt = await prisma.vocabAttempt.findUnique({
    where: { token },
    select: {
      status: true,
      totalQuestions: true,
      student: { select: { name: true } },
      exam: { select: { title: true, questionCount: true, perQuestionSeconds: true } },
    },
  });

  if (!attempt) {
    return <Notice title="시험을 찾을 수 없어요" body="링크가 올바른지 확인해 주세요. 문제가 계속되면 담당 선생님께 문의해 주세요." />;
  }
  if (attempt.status === "EXPIRED") {
    return <Notice title="이미 종료된 시험이에요" body="이 시험 링크는 만료되었거나 취소되었습니다." />;
  }
  if (attempt.status === "SUBMITTED") {
    redirect(`/v/${token}/result`);
  }

  return (
    <VocabExperience
      token={token}
      studentName={attempt.student.name}
      examTitle={attempt.exam.title}
      questionCount={attempt.exam.questionCount}
      perQuestionSeconds={attempt.exam.perQuestionSeconds}
      resuming={attempt.status === "IN_PROGRESS"}
    />
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto flex min-h-[80svh] max-w-[520px] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-[20px] font-bold text-ink">{title}</h1>
      <p className="mt-3 text-[14px] leading-relaxed text-ink-4">{body}</p>
    </div>
  );
}
