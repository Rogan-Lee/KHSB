import { redirect } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  ChevronRight,
  PlayCircle,
} from "lucide-react";
import { validateMagicLink } from "@/lib/student-auth";
import { prisma } from "@/lib/prisma";
import { SURVEY_SECTIONS } from "@/lib/online/survey-template";
import { SurveySubmitButton } from "@/components/online/survey-submit-button";

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

  const sections =
    (survey?.sections as Record<string, { answer?: string }> | null) ?? null;

  const filledFlags = SURVEY_SECTIONS.map(
    (s) => (sections?.[s.key]?.answer ?? "").trim().length > 0
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
    <div className="space-y-4">
      {/* Status hero */}
      {isSubmitted ? (
        <section className="rounded-[18px] border border-ok/30 bg-ok-soft p-5 text-center">
          <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-ok text-white">
            <CheckCircle2 className="h-6 w-6" strokeWidth={2.5} />
          </div>
          <h2 className="mt-3 text-[18px] font-bold tracking-[-0.01em] text-ok-ink">
            제출 완료
          </h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ok-ink/80">
            컨설턴트가 확인 후 곧 연락드릴 예정이에요.
          </p>
        </section>
      ) : (
        <section className="rounded-[18px] bg-gradient-to-br from-violet to-violet-ink p-5 text-white shadow-md">
          <p className="text-[11.5px] font-semibold uppercase tracking-wider opacity-90">
            초기 설문
          </p>
          <h2 className="mt-1 text-[20px] font-bold tracking-[-0.02em]">
            7개 질문에 답해 주세요
          </h2>
          <p className="mt-2 text-[12.5px] leading-relaxed opacity-95">
            컨설턴트가 본인 상황을 깊이 이해하기 위한 질문이에요. 한 번에 다 쓰지
            않아도 자동 저장돼요.
          </p>
          <div className="mt-3.5 flex items-center gap-3">
            <div className="flex-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/25">
                <div
                  className="h-full rounded-full bg-white transition-all duration-500"
                  style={{ width: `${(filledCount / total) * 100}%` }}
                />
              </div>
            </div>
            <span className="text-[12px] font-bold tabular-nums">
              {filledCount}/{total}
            </span>
          </div>
        </section>
      )}

      {/* CTA */}
      {!isSubmitted && (
        <Link
          href={resumeHref}
          className="flex items-center justify-center gap-2 rounded-[14px] bg-ink py-3.5 text-[14.5px] font-semibold text-white shadow-sm active:scale-[0.99] transition-transform"
        >
          <PlayCircle className="h-4 w-4" strokeWidth={2.5} />
          {ctaLabel}
        </Link>
      )}

      {/* Section overview */}
      <section>
        <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-ink-4">
          전체 질문
        </h3>
        <ul className="space-y-2">
          {SURVEY_SECTIONS.map((s, idx) => {
            const filled = filledFlags[idx];
            return (
              <li key={s.key}>
                <Link
                  href={`/s/${token}/survey/${idx + 1}`}
                  className="flex items-center gap-3 rounded-[12px] border border-line bg-panel p-3.5 active:bg-canvas-2 transition-colors"
                >
                  <span
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      filled
                        ? "bg-ok text-white"
                        : "bg-canvas-2 text-ink-4"
                    }`}
                  >
                    {filled ? (
                      <CheckCircle2 className="h-4 w-4" strokeWidth={2.5} />
                    ) : (
                      <Circle className="h-4 w-4" strokeWidth={2.2} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-4">
                      Q{idx + 1}
                    </p>
                    <p className="mt-0.5 text-[13.5px] font-semibold text-ink leading-snug">
                      {s.title}
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-[11.5px] text-ink-4">
                      {filled ? "작성 완료" : "미작성"}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-5" />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Submit gate */}
      {!isSubmitted && (
        <section className="rounded-[14px] border border-line bg-panel p-4">
          {allFilled ? (
            <>
              <p className="text-[13px] font-semibold text-ink">
                모든 질문에 답하셨어요
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-4">
                제출 후에는 수정이 제한됩니다. 검토가 끝났다면 제출해 주세요.
              </p>
              <div className="mt-3">
                <SurveySubmitButton studentToken={token} allAnswered={true} />
              </div>
            </>
          ) : (
            <>
              <p className="text-[13px] font-semibold text-ink-3">
                아직 {total - filledCount}개 질문이 남았어요
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-4">
                모든 질문에 답하면 여기에 제출 버튼이 활성화됩니다.
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
