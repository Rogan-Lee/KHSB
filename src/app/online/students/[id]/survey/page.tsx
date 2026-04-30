import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getSurveyForReview } from "@/actions/online/onboarding-survey";
import { SURVEY_SECTIONS } from "@/lib/online/survey-template";

export default async function StudentSurveyReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data;
  try {
    data = await getSurveyForReview(id);
  } catch {
    notFound();
  }

  const { student, survey } = data;
  const sections =
    (survey?.sections as Record<string, { answer?: string }> | null) ?? {};

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/online/students/${id}`}
          className="inline-flex items-center gap-1 text-[12px] text-ink-4 hover:text-ink"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          학생 상세
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-semibold text-ink tracking-[-0.015em]">
          {student.name} — 초기 설문
        </h1>
        <p className="mt-1 text-[13px] text-ink-4">
          {survey?.submittedAt
            ? `제출됨: ${survey.submittedAt.toLocaleString("ko-KR")} · version ${survey.version}`
            : survey
              ? "작성 중 (미제출)"
              : "아직 작성 시작하지 않음"}
        </p>
      </header>

      {!survey && (
        <div className="rounded-[12px] border border-dashed border-line bg-canvas-2/50 p-8 text-center text-[13px] text-ink-4">
          학생이 아직 설문 작성을 시작하지 않았습니다.
          <br />
          매직링크로 설문 페이지에 접속하면 답변이 이곳에 표시됩니다.
        </div>
      )}

      {survey && (
        <div className="space-y-3">
          {SURVEY_SECTIONS.map((section) => {
            const answer = sections[section.key]?.answer?.trim() ?? "";
            return (
              <section
                key={section.key}
                className="rounded-[12px] border border-line bg-panel p-4"
              >
                <h3 className="text-[13px] font-semibold text-ink">
                  {section.title}
                </h3>
                <p className="mt-1 text-[11.5px] text-ink-5 leading-relaxed">
                  {section.description}
                </p>
                <div className="mt-3 rounded-[8px] border border-line-2 bg-canvas px-3 py-2.5 text-[12.5px] text-ink whitespace-pre-wrap leading-relaxed min-h-[2.5em]">
                  {answer || <span className="text-ink-5">(비어 있음)</span>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
