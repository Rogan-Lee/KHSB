import { notFound } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { getSurveyForReview } from "@/actions/online/onboarding-survey";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";
import {
  SURVEY_SECTIONS,
  normalizePerformanceAnswer,
  normalizeHistoryAnswer,
  normalizeGoalsAnswer,
  normalizeAdmissionTypeAnswer,
  normalizeStrengthsWeaknessesAnswer,
  parseGradeNumber,
} from "@/lib/online/survey-template";
import { EmptyState, Section, StatusBadge } from "@/components/backoffice/ui";
import { SurveyEmpty } from "@/components/online/survey-answer-ui";
import { PerformanceSurveyDisplay } from "@/components/online/performance-survey-display";
import { HistorySurveyDisplay } from "@/components/online/history-survey-display";
import { GoalsSurveyDisplay } from "@/components/online/goals-survey-display";
import { AdmissionTypeSurveyDisplay } from "@/components/online/admission-type-survey-display";
import { StrengthsWeaknessesSurveyDisplay } from "@/components/online/strengths-weaknesses-survey-display";
import { StudentDetailHeader } from "../_components/student-detail-header";

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
  const sections = (survey?.sections as Record<string, unknown> | null) ?? {};

  // admissionType 학기 노출 판단용 학년 (+ 머리 상태 배지용 재원 상태)
  const gradeRow = await prisma.student.findUnique({
    where: { id: student.id },
    select: { grade: true, status: true },
  });
  const gradeNumber = parseGradeNumber(gradeRow?.grade ?? null);

  const submitState = survey?.submittedAt
    ? { label: "제출 완료", tone: "ok" as const }
    : survey
      ? { label: "작성 중", tone: "warn" as const }
      : { label: "미작성", tone: "gray" as const };

  return (
    <div>
      <StudentDetailHeader
        student={{ id: student.id, name: student.name, status: gradeRow?.status }}
        current="survey"
        description={
          <span className="inline-flex flex-wrap items-center gap-x-x2 gap-y-x1">
            <StatusBadge tone={submitState.tone}>{submitState.label}</StatusBadge>
            <span className="tabular-nums">
              {survey?.submittedAt
                ? `${formatDateTime(survey.submittedAt)} 제출 · 버전 ${survey.version}`
                : survey
                  ? "아직 제출하지 않았어요"
                  : "아직 작성을 시작하지 않았어요"}
            </span>
          </span>
        }
      />

      {!survey && (
        <Section>
          <EmptyState
            icon={ClipboardList}
            title="학생이 아직 설문을 시작하지 않았어요"
            description="매직링크로 설문 페이지에 들어오면 답변이 이곳에 표시돼요."
          />
        </Section>
      )}

      {survey && (
        <div className="flex flex-col gap-x6">
          {SURVEY_SECTIONS.map((section) => {
            const raw = sections[section.key];
            return (
              <Section key={section.key} title={section.title} description={section.description}>
                {section.kind === "text" ? (
                  <TextAnswerDisplay raw={raw} />
                ) : section.kind === "performance" ? (
                  <PerformanceSurveyDisplay value={normalizePerformanceAnswer(
                    raw && typeof raw === "object" && "answer" in raw
                      ? (raw as { answer: unknown }).answer
                      : raw,
                  )} />
                ) : section.kind === "history" ? (
                  <HistorySurveyDisplay value={normalizeHistoryAnswer(
                    raw && typeof raw === "object" && "answer" in raw
                      ? (raw as { answer: unknown }).answer
                      : raw,
                  )} />
                ) : section.kind === "goals" ? (
                  <GoalsSurveyDisplay value={normalizeGoalsAnswer(
                    raw && typeof raw === "object" && "answer" in raw
                      ? (raw as { answer: unknown }).answer
                      : raw,
                  )} />
                ) : section.kind === "admissionType" ? (
                  <AdmissionTypeSurveyDisplay
                    value={normalizeAdmissionTypeAnswer(
                      raw && typeof raw === "object" && "answer" in raw
                        ? (raw as { answer: unknown }).answer
                        : raw,
                    )}
                    gradeNumber={gradeNumber}
                  />
                ) : (
                  <StrengthsWeaknessesSurveyDisplay value={normalizeStrengthsWeaknessesAnswer(
                    raw && typeof raw === "object" && "answer" in raw
                      ? (raw as { answer: unknown }).answer
                      : raw,
                  )} />
                )}
              </Section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TextAnswerDisplay({ raw }: { raw: unknown }) {
  const answer =
    raw && typeof raw === "object" && "answer" in raw
      ? String((raw as { answer: unknown }).answer ?? "")
      : typeof raw === "string"
        ? raw
        : "";
  const trimmed = answer.trim();
  if (!trimmed) return <SurveyEmpty />;
  return <p className="whitespace-pre-wrap break-words t4-regular text-fg-neutral">{trimmed}</p>;
}
