import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { SearchX, TimerOff } from "lucide-react";
import { VocabExperience } from "./_components/vocab-runner";
import { VocabNotice } from "./_components/vocab-notice";
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
      student: {
        select: {
          name: true,
          // 활성 매직링크가 있으면 뒤로 가기·안내 화면에서 학생 포털로 돌아갈 수 있게
          magicLinks: {
            where: { revokedAt: null, expiresAt: { gt: new Date() } },
            orderBy: { issuedAt: "desc" },
            take: 1,
            select: { token: true },
          },
        },
      },
      exam: { select: { title: true, questionCount: true, perQuestionSeconds: true } },
    },
  });

  if (!attempt) {
    return (
      <VocabNotice
        icon={SearchX}
        tone="gray"
        title="시험을 찾을 수 없어요"
        body={"링크가 올바른지 확인해 주세요.\n계속 안 되면 담당 선생님께 알려 주세요."}
      />
    );
  }

  const portalToken = attempt.student.magicLinks[0]?.token ?? null;
  const portalHref = portalToken ? `/s/${portalToken}/vocab` : undefined;

  if (attempt.status === "EXPIRED") {
    return <ExpiredNotice portalHref={portalHref} />;
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
    return <ExpiredNotice portalHref={portalHref} />;
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
      portalHref={portalHref}
    />
  );
}

function ExpiredNotice({ portalHref }: { portalHref?: string }) {
  return (
    <VocabNotice
      icon={TimerOff}
      tone="gray"
      title="이미 종료된 시험이에요"
      body="이 시험 링크는 만료됐거나 취소됐어요."
      portalHref={portalHref}
    />
  );
}
