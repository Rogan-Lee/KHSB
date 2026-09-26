import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { BookOpen, PartyPopper, SearchX } from "lucide-react";
import { BottomCTA, ButtonLink, IconTile } from "@/components/portal/ui";
import { cn } from "@/lib/utils";
import { VocabTopBar } from "../_components/vocab-top-bar";
import { VocabNotice } from "../_components/vocab-notice";
import { ResultWords } from "./result-words";
import { ResultExitButton } from "./result-exit-button";
import { portalHrefFromReferer } from "../portal-href";

export const dynamic = "force-dynamic";

/** 소요 시간 — null 이면 "—", 1분 미만이면 "1분 미만" */
function fmtDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 60_000) return "1분 미만";
  return `${Math.round(ms / 60_000)}분`;
}

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
      student: { select: { id: true, name: true } },
      exam: { select: { title: true } },
      items: {
        orderBy: { order: "asc" },
        select: { order: true, direction: true, prompt: true, word: true, meanings: true, studentAnswer: true, isCorrect: true },
      },
    },
  });

  if (!attempt) {
    return <VocabNotice icon={SearchX} title="결과를 찾을 수 없어요" body="링크가 올바른지 확인해 주세요." />;
  }
  if (attempt.status !== "SUBMITTED") {
    redirect(`/v/${token}`);
  }

  const score = attempt.score ?? 0;
  const pass = score >= 80;
  const correct = attempt.correctCount;
  const wrong = Math.max(0, attempt.totalQuestions - attempt.correctCount);
  // 포털에서 들어온 경우에만 포털 링크 노출 (응시 링크로 포털 토큰이 새지 않게 — ../portal-href.ts)
  const portalHref = await portalHrefFromReferer(attempt.student.id);

  return (
    <>
      <VocabTopBar leading="close" title="시험 결과" fallbackHref={portalHref} />

      <main className="mx-auto max-w-[480px] px-x5 pb-x4">
        {/* 결과 요약 */}
        <div className="flex flex-col items-center pt-x6 text-center">
          <IconTile icon={pass ? PartyPopper : BookOpen} tone={pass ? "ok" : "warn"} size={64} round />
          <h1 className="mt-x5 t8-bold text-fg-neutral">{pass ? "통과했어요!" : "조금만 더 외워봐요"}</h1>
          <p className="mt-x1_5 t4-regular text-fg-neutral-subtle">
            {attempt.student.name} 학생 · {attempt.exam.title}
          </p>
          <p
            className={cn(
              "mt-x5 flex items-baseline justify-center gap-x0_5",
              pass ? "text-fg-positive" : "text-fg-neutral"
            )}
          >
            <span className="t14-bold tabular-nums">{score}</span>
            <span className="t7-bold">점</span>
          </p>
        </div>

        {/* 정답 · 오답 · 소요 시간 */}
        <dl className="mt-x6 grid grid-cols-3 divide-x divide-stroke-neutral-subtle rounded-r4 bg-bg-layer-fill py-x4">
          <Stat label="정답" value={`${correct}개`} className="text-fg-positive" />
          <Stat label="오답" value={`${wrong}개`} className={wrong > 0 ? "text-fg-critical" : "text-fg-neutral"} />
          <Stat label="소요 시간" value={fmtDuration(attempt.durationMs)} className="text-fg-neutral" />
        </dl>

        <ResultWords
          items={attempt.items.map((i) => ({
            order: i.order,
            direction: i.direction,
            word: i.word,
            meanings: i.meanings,
            studentAnswer: i.studentAnswer,
            isCorrect: i.isCorrect,
          }))}
        />

        <p className="mt-x8 text-center t3-regular text-fg-neutral-subtle">
          제출이 끝난 시험은 다시 볼 수 없어요.
        </p>
      </main>

      <BottomCTA>
        {portalHref ? (
          <ButtonLink href={portalHref} variant="primary" size="xl" block>
            영단어 시험 목록으로
          </ButtonLink>
        ) : (
          <ResultExitButton />
        )}
      </BottomCTA>
    </>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex flex-col items-center gap-x1 px-x2">
      <dt className="t3-regular text-fg-neutral-subtle">{label}</dt>
      <dd className={cn("t6-bold tabular-nums", className)}>{value}</dd>
    </div>
  );
}
