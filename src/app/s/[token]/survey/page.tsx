import { redirect } from "next/navigation";
import { Check } from "lucide-react";
import { validateMagicLink } from "@/lib/student-auth";
import { prisma } from "@/lib/prisma";
import { SURVEY_SECTIONS, isSectionComplete, parseGradeNumber } from "@/lib/online/survey-template";
import { SurveySubmitButton } from "@/components/online/survey-submit-button";
import {
  BottomCTA,
  ButtonLink,
  IconTile,
  ListRow,
  ProgressBar,
  Section,
} from "@/components/portal/ui";
import { cn } from "@/lib/utils";

export default async function StudentSurveyIntroPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await validateMagicLink(token);
  if (!session) redirect("/s/expired");

  const survey = await prisma.onboardingSurvey.findUnique({
    where: { studentId: session.student.id },
    select: { sections: true, submittedAt: true },
  });

  const sections = (survey?.sections as Record<string, unknown> | null) ?? null;

  const gradeCtx = { gradeNumber: parseGradeNumber(session.student.grade) };
  const filledFlags = SURVEY_SECTIONS.map((s) =>
    isSectionComplete(s, sections?.[s.key], gradeCtx),
  );
  const filledCount = filledFlags.filter(Boolean).length;
  const total = SURVEY_SECTIONS.length;
  const allFilled = filledCount === total;
  const isSubmitted = !!survey?.submittedAt;

  const firstIncomplete = filledFlags.findIndex((f) => !f);
  const resumeStep =
    firstIncomplete === -1 ? 1 : firstIncomplete + 1; // 1-based
  const resumeHref = `/s/${token}/survey/${resumeStep}`;
  const ctaLabel = isSubmitted
    ? "제출 완료"
    : filledCount === 0
      ? "설문 시작하기"
      : allFilled
        ? "검토하기"
        : `이어서 작성 (${resumeStep}/${total})`;

  return (
    <div className="flex flex-col gap-x3">
      {/* 상태 헤딩 */}
      <div className="px-x1 pb-x3 pt-x4">
        {isSubmitted ? (
          <>
            <IconTile icon={Check} tone="ok" solid size={56} round />
            <h2 className="mt-x5 t9-bold text-fg-neutral">제출 완료</h2>
            <p className="mt-x2 t5-regular text-fg-neutral-muted">
              컨설턴트가 확인한 뒤 곧 연락드릴게요.
            </p>
          </>
        ) : (
          <>
            <h2 className="t9-bold text-fg-neutral">{total}개 질문에 답해 주세요</h2>
            <p className="mt-x2 t5-regular text-fg-neutral-muted">
              컨설턴트가 본인 상황을 깊이 이해하기 위한 질문이에요. 한 번에 다 쓰지
              않아도 자동으로 저장돼요.
            </p>
          </>
        )}
      </div>

      {/* 진행률 */}
      {!isSubmitted && (
        <Section>
          <div className="flex items-baseline justify-between">
            <p className="t5-medium text-fg-neutral-muted">작성한 질문</p>
            <p className="t5-bold tabular-nums">
              <span className={allFilled ? "text-fg-positive" : "text-fg-brand"}>{filledCount}</span>
              <span className="text-fg-placeholder"> / {total}</span>
            </p>
          </div>
          <ProgressBar
            value={filledCount / total}
            tone={allFilled ? "ok" : "brand"}
            className="mt-x3"
          />
        </Section>
      )}

      {/* 전체 질문 */}
      <Section title="전체 질문" flush>
        {SURVEY_SECTIONS.map((s, idx) => {
          const filled = filledFlags[idx];
          return (
            <ListRow
              key={s.key}
              href={`/s/${token}/survey/${idx + 1}`}
              leading={
                <span
                  aria-hidden
                  className={cn(
                    "inline-flex size-x8 shrink-0 items-center justify-center rounded-full t4-bold tabular-nums",
                    filled
                      ? "bg-bg-positive-solid text-palette-static-white"
                      : "bg-bg-neutral-weak text-fg-neutral-subtle",
                  )}
                >
                  {filled ? <Check className="h-4 w-4" strokeWidth={3} /> : idx + 1}
                </span>
              }
              title={s.title}
              description={
                <span className={filled ? "text-fg-positive" : undefined}>
                  {filled ? "작성 완료" : "미작성"}
                </span>
              }
            />
          );
        })}
      </Section>

      {/* 하단 CTA */}
      {!isSubmitted && (
        <BottomCTA
          note={
            allFilled
              ? "모든 질문에 답했어요 · 제출 후에는 수정이 제한돼요"
              : `${total - filledCount}개 남았어요 · 모두 답하면 제출할 수 있어요`
          }
        >
          {allFilled ? (
            <SurveySubmitButton studentToken={token} allAnswered={true} />
          ) : (
            <ButtonLink href={resumeHref} variant="primary" size="xl" block>
              {ctaLabel}
            </ButtonLink>
          )}
        </BottomCTA>
      )}
    </div>
  );
}
