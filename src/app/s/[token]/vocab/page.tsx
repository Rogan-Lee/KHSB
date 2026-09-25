import { redirect } from "next/navigation";
import { validateMagicLink } from "@/lib/student-auth";
import { prisma } from "@/lib/prisma";
import { AlarmClock, BookOpen, Check, Clock, SpellCheck } from "lucide-react";
import { Badge, ButtonLink, EmptyState, IconTile, ListRow, Section } from "@/components/portal/ui";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const KST_OFFSET = 9 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

function fmtDate(d: Date): string {
  return d.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });
}

/** 이미 지난 시각인지 (만료됐지만 아직 EXPIRED 로 전이되지 않은 응시 걸러내기용) */
function isPast(d: Date): boolean {
  return d.getTime() <= Date.now();
}

/** KST 달력 기준 남은 일수 — 오늘 0, 내일 1 … */
function kstDaysUntil(d: Date): number {
  const today = Math.floor((Date.now() + KST_OFFSET) / DAY_MS);
  const target = Math.floor((d.getTime() + KST_OFFSET) / DAY_MS);
  return target - today;
}

/** 마감 3일 이내면 "오늘 마감" / "D-2 마감" */
function dueLabel(expiresAt: Date | null): { label: string; urgent: boolean } | null {
  if (!expiresAt) return null;
  const days = kstDaysUntil(expiresAt);
  if (days > 3) return null;
  return days <= 0 ? { label: "오늘 마감", urgent: true } : { label: `D-${days} 마감`, urgent: false };
}

/** 소수 첫째 자리까지 */
function fmtScore(n: number): number {
  return Math.round(n * 10) / 10;
}

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
      expiresAt: true,
      exam: { select: { title: true, questionCount: true, perQuestionSeconds: true } },
    },
  });

  // 응시 기한이 지난 미제출 시험은 /v 진입 시 EXPIRED 로 바뀌므로 목록에서도 뺀다
  const visible = attempts.filter(
    (a) => a.status === "SUBMITTED" || !a.expiresAt || !isPast(a.expiresAt)
  );
  const todo = visible.filter((a) => a.status === "ASSIGNED");
  const inProgress = visible.filter((a) => a.status === "IN_PROGRESS");
  const done = visible
    .filter((a) => a.status === "SUBMITTED")
    .sort(
      (x, y) => (y.submittedAt ?? y.assignedAt).getTime() - (x.submittedAt ?? x.assignedAt).getTime()
    );
  const open = [...inProgress, ...todo];

  if (visible.length === 0) {
    return (
      <Section className="mt-x2">
        <EmptyState
          icon={SpellCheck}
          title="아직 배정된 영단어 시험이 없어요"
          description="선생님이 시험을 배정하면 여기에 보여요."
        />
      </Section>
    );
  }

  const avgScore =
    done.length > 0 ? fmtScore(done.reduce((sum, a) => sum + (a.score ?? 0), 0) / done.length) : 0;
  const latestScore = done.length > 0 ? fmtScore(done[0].score ?? 0) : 0;

  return (
    <div className="flex flex-col gap-x3">
      <div className="px-x1 pb-x2 pt-x3">
        <p className="t8-bold text-fg-neutral">
          {open.length > 0 ? (
            <>
              응시할 시험이 <span className="text-fg-brand tabular-nums">{open.length}건</span> 있어요
            </>
          ) : (
            "응시할 시험이 없어요"
          )}
        </p>
        <p className="mt-x1 t4-regular text-fg-neutral-subtle">
          {open.length > 0 ? "한 번 제출한 시험은 다시 볼 수 없어요" : "새 시험이 배정되면 여기에 보여요"}
        </p>
      </div>

      {open.map((a) => (
        <OpenExamCard key={a.id} attempt={a} />
      ))}

      {done.length > 0 && (
        <Section>
          <dl className="grid grid-cols-3 divide-x divide-stroke-neutral-subtle">
            <SummaryStat label="완료" value={`${done.length}개`} />
            <SummaryStat label="평균" value={`${avgScore}점`} />
            <SummaryStat label="최근" value={`${latestScore}점`} />
          </dl>
        </Section>
      )}

      {done.length > 0 && (
        <Section title="지난 시험" flush>
          {done.map((a) => {
            const score = fmtScore(a.score ?? 0);
            const pass = score >= 80;
            return (
              <ListRow
                key={a.id}
                href={`/v/${a.token}/result`}
                leading={<IconTile icon={pass ? Check : BookOpen} tone={pass ? "ok" : "warn"} size={44} round />}
                title={a.exam.title}
                description={
                  <span className="tabular-nums">
                    {a.correctCount}/{a.totalQuestions} 정답
                    {a.submittedAt ? ` · ${fmtDate(a.submittedAt)}` : ""}
                  </span>
                }
                trailing={
                  <span className={cn("t5-bold tabular-nums", pass ? "text-fg-positive" : "text-fg-warning")}>
                    {score}점
                  </span>
                }
              />
            );
          })}
        </Section>
      )}
    </div>
  );
}

type OpenAttempt = {
  token: string;
  status: string;
  expiresAt: Date | null;
  exam: { title: string; questionCount: number; perQuestionSeconds: number };
};

function OpenExamCard({ attempt: a }: { attempt: OpenAttempt }) {
  const inProgress = a.status === "IN_PROGRESS";
  const { questionCount: q, perQuestionSeconds: s } = a.exam;
  const meta =
    s > 0
      ? `${q}문항 · 문항당 ${s}초 · 약 ${Math.max(1, Math.ceil((q * s) / 60))}분`
      : `${q}문항 · 시간 제한 없음`;
  const due = dueLabel(a.expiresAt);

  return (
    <Section>
      <div className="flex items-start gap-x3_5">
        <IconTile icon={inProgress ? Clock : SpellCheck} tone={inProgress ? "warn" : "brand"} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-x2">
            <p className="min-w-0 break-words t6-bold text-fg-neutral">{a.exam.title}</p>
            <Badge tone={inProgress ? "warn" : "brand"} className="mt-x0_5">
              {inProgress ? "푸는 중" : "새 시험"}
            </Badge>
          </div>
          <p className="mt-x1 t4-regular text-fg-neutral-subtle tabular-nums">{meta}</p>
          {due && (
            <p
              className={cn(
                "mt-x1_5 flex items-center gap-x1 t3-bold tabular-nums",
                due.urgent ? "text-fg-critical" : "text-fg-warning"
              )}
            >
              <AlarmClock className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
              {due.label}
            </p>
          )}
        </div>
      </div>
      <ButtonLink href={`/v/${a.token}`} variant="primary" size="lg" block className="mt-x4">
        {inProgress ? "이어서 풀기" : "시험 보기"}
      </ButtonLink>
    </Section>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-x1 px-x2">
      <dt className="t3-regular text-fg-neutral-subtle">{label}</dt>
      <dd className="t7-bold text-fg-neutral tabular-nums">{value}</dd>
    </div>
  );
}
