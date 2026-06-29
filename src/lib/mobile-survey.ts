import { MobileApiError } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { notifySlack } from "@/lib/slack";
import {
  SURVEY_SECTIONS,
  emptySurveySections,
  isSectionComplete,
  isSurveyComplete,
  normalizeSectionValue,
  parseGradeNumber,
} from "@/lib/online/survey-template";

const SECTION_BY_KEY = new Map(SURVEY_SECTIONS.map((s) => [s.key, s]));
const VALID_KEYS = new Set(SURVEY_SECTIONS.map((s) => s.key));

type StudentCtx = { id: string; grade: string | null };

/**
 * 모바일 온보딩 설문 — 학생 세션 인증 기반.
 * 웹 포털(`/s/[token]/survey`)과 동일 로직(`onboarding-survey.ts`)을 studentId 로 재사용.
 * 백엔드가 권위 검증(survey-template)을 수행하고, 섹션별 complete 플래그를 함께 반환한다.
 */
export async function getMobileSurvey(student: StudentCtx) {
  const survey = await prisma.onboardingSurvey.findUnique({
    where: { studentId: student.id },
  });
  const gradeNumber = parseGradeNumber(student.grade);
  const now = new Date();
  const rawSections =
    (survey?.sections as Record<string, unknown> | null) ?? emptySurveySections();

  const sections = SURVEY_SECTIONS.map((section) => {
    const value = normalizeSectionValue(section, rawSections[section.key]);
    return {
      key: section.key,
      kind: section.kind,
      title: section.title,
      description: section.description,
      placeholder: section.kind === "text" ? section.placeholder : undefined,
      value,
      complete: isSectionComplete(section, value, { gradeNumber, now }),
    };
  });

  return {
    submittedAt: survey?.submittedAt ? survey.submittedAt.toISOString() : null,
    gradeNumber,
    complete: isSurveyComplete(rawSections, { gradeNumber, now }),
    sections,
  };
}

export async function saveMobileSurveySection(
  student: StudentCtx,
  sectionKey: string,
  value: unknown,
) {
  if (!VALID_KEYS.has(sectionKey)) {
    throw new MobileApiError("잘못된 섹션입니다", 400);
  }
  const section = SECTION_BY_KEY.get(sectionKey)!;

  // text 섹션은 { answer } 또는 string 허용 → 정규화해 저장
  let nextValue: unknown;
  if (section.kind === "text") {
    if (typeof value === "string") nextValue = { answer: value };
    else if (value && typeof value === "object" && "answer" in value) {
      const a = (value as { answer?: unknown }).answer;
      nextValue = { answer: typeof a === "string" ? a : "" };
    } else nextValue = { answer: "" };
  } else {
    if (value == null || typeof value !== "object") {
      throw new MobileApiError("섹션 값 형식이 올바르지 않습니다", 400);
    }
    nextValue = value;
  }

  const existing = await prisma.onboardingSurvey.findUnique({
    where: { studentId: student.id },
    select: { sections: true },
  });
  const currentSections =
    (existing?.sections as Record<string, unknown> | null) ?? emptySurveySections();
  const nextSections = { ...currentSections, [sectionKey]: nextValue };

  await prisma.onboardingSurvey.upsert({
    where: { studentId: student.id },
    update: { sections: nextSections as object },
    create: { studentId: student.id, sections: nextSections as object },
  });

  const gradeNumber = parseGradeNumber(student.grade);
  const now = new Date();
  const normalized = normalizeSectionValue(section, nextValue);
  return {
    ok: true,
    sectionComplete: isSectionComplete(section, normalized, { gradeNumber, now }),
    surveyComplete: isSurveyComplete(nextSections, { gradeNumber, now }),
  };
}

export async function submitMobileSurvey(student: StudentCtx & { name: string }) {
  const survey = await prisma.onboardingSurvey.findUnique({
    where: { studentId: student.id },
  });
  if (!survey) throw new MobileApiError("설문이 아직 작성되지 않았습니다", 400);
  if (survey.submittedAt) return { ok: true, alreadySubmitted: true };

  const gradeNumber = parseGradeNumber(student.grade);
  if (!isSurveyComplete(survey.sections, { gradeNumber, now: new Date() })) {
    throw new MobileApiError("아직 모든 섹션을 완료하지 않았습니다", 400);
  }

  await prisma.onboardingSurvey.update({
    where: { studentId: student.id },
    data: { submittedAt: new Date() },
  });

  void notifySlack(
    `[온라인 설문·앱] ${student.name} 학생이 초기 설문을 제출했습니다. /online/students/${student.id}/survey 에서 확인하세요.`,
  );

  return { ok: true };
}
