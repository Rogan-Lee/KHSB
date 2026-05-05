import { redirect, notFound } from "next/navigation";
import { validateMagicLink } from "@/lib/student-auth";
import { prisma } from "@/lib/prisma";
import {
  SURVEY_SECTIONS,
  normalizePerformanceAnswer,
  type PerformanceAnswer,
} from "@/lib/online/survey-template";
import { SurveyWizardStep } from "@/components/online/survey-wizard-step";

export default async function SurveyStepPage({
  params,
}: {
  params: Promise<{ token: string; step: string }>;
}) {
  const { token, step } = await params;
  const stepNum = Number(step);
  if (
    !Number.isInteger(stepNum) ||
    stepNum < 1 ||
    stepNum > SURVEY_SECTIONS.length
  ) {
    notFound();
  }
  const stepIndex = stepNum - 1;

  const session = await validateMagicLink(token);
  if (!session) redirect("/s/expired");

  const survey = await prisma.onboardingSurvey.findUnique({
    where: { studentId: session.student.id },
    select: { sections: true, submittedAt: true },
  });

  const sections = (survey?.sections as Record<string, unknown> | null) ?? null;
  const section = SURVEY_SECTIONS[stepIndex];
  const raw = sections?.[section.key];

  let initialValue: string | PerformanceAnswer;
  if (section.kind === "text") {
    initialValue =
      raw && typeof raw === "object" && "answer" in raw
        ? String((raw as { answer: unknown }).answer ?? "")
        : typeof raw === "string"
          ? raw
          : "";
  } else {
    // performance — string legacy 면 legacyText 로 이관
    initialValue = normalizePerformanceAnswer(
      raw && typeof raw === "object" && "answer" in raw
        ? (raw as { answer: unknown }).answer
        : raw,
    );
  }

  return (
    <SurveyWizardStep
      studentToken={token}
      section={section}
      initialValue={initialValue}
      stepIndex={stepIndex}
      totalSteps={SURVEY_SECTIONS.length}
      isSubmitted={!!survey?.submittedAt}
    />
  );
}
