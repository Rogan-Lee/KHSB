import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { VocabExperience } from "./_components/vocab-runner";
import { getRequestMeta } from "@/lib/token-auth";

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
      id: true,
      status: true,
      totalQuestions: true,
      expiresAt: true,
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
  // 응시 전 만료된 시험은 자동 EXPIRED 전이 (제출 완료된 응시는 결과 조회 허용)
  // force-dynamic server component 라 Date.now() 사용 안전 (React render 룰 false positive)
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  if (
    attempt.expiresAt &&
    attempt.expiresAt.getTime() < nowMs &&
    attempt.status !== "SUBMITTED"
  ) {
    await prisma.vocabAttempt
      .update({ where: { id: attempt.id }, data: { status: "EXPIRED" } })
      .catch(() => {});
    return <Notice title="이미 종료된 시험이에요" body="이 시험 링크는 만료되었거나 취소되었습니다." />;
  }
  if (attempt.status === "SUBMITTED") {
    redirect(`/v/${token}/result`);
  }

  // IP/UA 접근 로그 (fire-and-forget)
  const { ip, ua } = await getRequestMeta();
  prisma.vocabAttempt
    .update({
      where: { id: attempt.id },
      data: { lastAccessIp: ip, lastAccessUa: ua },
    })
    .catch(() => {});

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
