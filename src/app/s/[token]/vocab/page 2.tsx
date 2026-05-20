import { redirect } from "next/navigation";
import Link from "next/link";
import { validateMagicLink } from "@/lib/student-auth";
import { prisma } from "@/lib/prisma";
import { ChevronRight, SpellCheck, PlayCircle, CheckCircle2, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function StudentVocabPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await validateMagicLink(token);
  if (!session) redirect("/s/expired");

  const attempts = await prisma.vocabAttempt.findMany({
    where: { studentId: session.student.id, status: { not: "EXPIRED" } },
    orderBy: { assignedAt: "desc" },
    select: {
      id: true,
      token: true,
      status: true,
      score: true,
      correctCount: true,
      totalQuestions: true,
      assignedAt: true,
      submittedAt: true,
      exam: { select: { title: true, questionCount: true, perQuestionSeconds: true } },
    },
  });

  const todo = attempts.filter((a) => a.status === "ASSIGNED");
  const inProgress = attempts.filter((a) => a.status === "IN_PROGRESS");
  const done = attempts.filter((a) => a.status === "SUBMITTED");

  return (
    <div className="space-y-5">
      <section className="rounded-[16px] bg-gradient-to-br from-brand to-brand-2 p-5 text-white shadow-md">
        <div className="flex items-center gap-2">
          <SpellCheck className="h-4 w-4" />
          <p className="text-[12px] font-medium opacity-90">영단어 시험</p>
        </div>
        <p className="mt-2 text-[14px] leading-relaxed opacity-95">
          {todo.length + inProgress.length > 0
            ? `응시할 시험이 ${todo.length + inProgress.length}건 있어요.`
            : "응시할 시험이 없어요."}
        </p>
      </section>

      {inProgress.length > 0 && (
        <Group title="이어서 풀기" icon={<Clock className="h-3.5 w-3.5" />}>
          {inProgress.map((a) => (
            <AttemptRow key={a.id} href={`/v/${a.token}`} title={a.exam.title}
              meta={`${a.exam.questionCount}문항 · ${a.exam.perQuestionSeconds || "∞"}초/문항`}
              cta="이어서 풀기" tone="warn" />
          ))}
        </Group>
      )}

      {todo.length > 0 && (
        <Group title="응시할 시험" icon={<PlayCircle className="h-3.5 w-3.5" />}>
          {todo.map((a) => (
            <AttemptRow key={a.id} href={`/v/${a.token}`} title={a.exam.title}
              meta={`${a.exam.questionCount}문항 · ${a.exam.perQuestionSeconds || "∞"}초/문항`}
              cta="시작하기" tone="brand" />
          ))}
        </Group>
      )}

      {done.length > 0 && (
        <Group title="완료한 시험" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
          {done.map((a) => (
            <Link key={a.id} href={`/v/${a.token}/result`}
              className="block rounded-[12px] border border-line bg-panel p-3.5 active:bg-canvas-2 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-[14.5px] font-semibold text-ink leading-snug">{a.exam.title}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${(a.score ?? 0) >= 80 ? "bg-ok-soft text-ok-ink" : "bg-warn-soft text-warn-ink"}`}>
                  {a.score ?? 0}점
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11.5px] text-ink-4">
                <span>{a.correctCount}/{a.totalQuestions} 정답</span>
                <span className="inline-flex items-center text-brand">결과 보기 <ChevronRight className="h-3.5 w-3.5" /></span>
              </div>
            </Link>
          ))}
        </Group>
      )}

      {attempts.length === 0 && (
        <p className="rounded-[12px] border border-line bg-canvas-2/50 px-4 py-6 text-center text-[13px] text-ink-4">
          아직 배정된 영단어 시험이 없어요.
        </p>
      )}
    </div>
  );
}

function Group({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-2 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-ink-4">
        {icon} {title}
      </p>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function AttemptRow({ href, title, meta, cta, tone }: { href: string; title: string; meta: string; cta: string; tone: "brand" | "warn" }) {
  return (
    <Link href={href} className="block rounded-[12px] border border-line bg-panel p-3.5 active:bg-canvas-2 transition-colors">
      <p className="text-[14.5px] font-semibold text-ink leading-snug">{title}</p>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-[11.5px] text-ink-4">{meta}</span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${tone === "brand" ? "bg-brand text-white" : "bg-warn-soft text-warn-ink"}`}>
          {cta} <ChevronRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
}
