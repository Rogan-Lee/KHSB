import { redirect, notFound } from "next/navigation";
import { validateMagicLink } from "@/lib/student-auth";
import { prisma } from "@/lib/prisma";
import { SURVEY_SECTIONS } from "@/lib/online/survey-template";
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

  const sections =
    (survey?.sections as Record<string, { answer?: string }> | null) ?? null;
  const section = SURVEY_SECTIONS[stepIndex];
  const initialValue = sections?.[section.key]?.answer ?? "";

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
