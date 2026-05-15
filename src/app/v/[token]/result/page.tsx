import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { CheckCircle2, XCircle, ChevronRight } from "lucide-react";
import { BackButton } from "./_back-button";

export const dynamic = "force-dynamic";

export default async function VocabResultPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const attempt = await prisma.vocabAttempt.findUnique({
    where: { token },
    select: {
      status: true,
      score: true,
      correctCount: true,
      totalQuestions: true,
      durationMs: true,
      student: {
        select: {
          id: true,
          name: true,
          // 활성 매직링크가 있으면 결과 페이지에서 학생 포털로 돌아갈 수 있게 노출
          magicLinks: {
            where: { revokedAt: null, expiresAt: { gt: new Date() } },
            orderBy: { issuedAt: "desc" },
            take: 1,
            select: { token: true },
          },
        },
      },
      exam: { select: { title: true } },
      items: {
        orderBy: { order: "asc" },
        select: { order: true, direction: true, prompt: true, word: true, meanings: true, studentAnswer: true, isCorrect: true },
      },
    },
  });

  if (!attempt) {
    return <Notice title="결과를 찾을 수 없어요" body="링크가 올바른지 확인해 주세요." />;
  }
  if (attempt.status !== "SUBMITTED") {
    redirect(`/v/${token}`);
  }

  const wrong = attempt.items.filter((i) => !i.isCorrect);
  const score = attempt.score ?? 0;
  const pass = score >= 80;
  const mins = attempt.durationMs ? Math.round(attempt.durationMs / 60000) : null;
  const portalToken = attempt.student.magicLinks[0]?.token ?? null;

  return (
    <div className="mx-auto max-w-[560px] px-6 py-8">
      <p className="text-[13px] font-medium text-ink-4">{attempt.student.name} 학생 · {attempt.exam.title}</p>

      <section className={`mt-4 rounded-[18px] p-6 text-center text-white shadow-md ${pass ? "bg-gradient-to-br from-ok to-ok" : "bg-gradient-to-br from-brand to-brand-2"}`}>
        <p className="text-[13px] font-medium opacity-90">시험 결과</p>
        <p className="mt-1 text-[44px] font-bold leading-none tabular-nums">{score}<span className="text-[22px] font-semibold">점</span></p>
        <p className="mt-2 text-[14px] opacity-95">
          {attempt.correctCount} / {attempt.totalQuestions} 정답{mins !== null ? ` · 소요 ${mins}분` : ""}
        </p>
      </section>

      {wrong.length === 0 ? (
        <div className="mt-5 flex items-center gap-2 rounded-[14px] border border-line bg-ok-soft px-4 py-3 text-[14px] font-medium text-ok-ink">
          <CheckCircle2 className="h-4 w-4" /> 모두 맞았어요! 잘했어요 🎉
        </div>
      ) : (
        <div className="mt-5">
          <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wider text-ink-4">
            <XCircle className="h-3.5 w-3.5" /> 틀린 단어 {wrong.length}개
          </p>
          <ul className="space-y-2">
            {wrong.map((it) => (
              <li key={it.order} className="rounded-[12px] border border-line bg-panel p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[16px] font-semibold text-ink">{it.direction === "EN_TO_KO" ? it.word : it.meanings.join(" / ")}</span>
                  <span className="text-[11px] text-ink-4">{it.direction === "EN_TO_KO" ? "영→한" : "한→영"}</span>
                </div>
                <p className="mt-1 text-[13px] text-ink-3">
                  정답: <b className="text-ink">{it.direction === "EN_TO_KO" ? it.meanings.join(", ") : it.word}</b>
                </p>
                <p className="mt-0.5 text-[13px] text-bad-ink">
                  내 답: {it.studentAnswer ? it.studentAnswer : "(미입력)"}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-6 text-center text-[12px] text-ink-4">제출이 완료되었습니다. 이 시험은 다시 응시할 수 없어요.</p>

      {/* 종료 후 이동 — 포털 링크가 있으면 학생 포털로, 없으면 단순 뒤로 가기 */}
      <div className="mt-5 flex flex-col gap-2">
        {portalToken && (
          <Link
            href={`/s/${portalToken}`}
            className="inline-flex items-center justify-center gap-1.5 rounded-[12px] bg-brand px-4 py-3 text-[14px] font-semibold text-white active:scale-[0.99] transition-transform"
          >
            내 포털로 돌아가기
            <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
          </Link>
        )}
        <BackButton label={portalToken ? "닫기" : "뒤로 가기"} />
      </div>
    </div>
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
