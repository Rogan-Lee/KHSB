"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireFullAccess, requireOnlineStaff } from "@/lib/roles";
import { validateMagicLink } from "@/lib/student-auth";
import { notifySlack } from "@/lib/slack";
import { emptySurveySections, SURVEY_SECTIONS } from "@/lib/online/survey-template";

const VALID_SECTION_KEYS = new Set(SURVEY_SECTIONS.map((s) => s.key));

/** 컨설턴트·원장용 설문 조회. */
export async function getSurveyForReview(studentId: string) {
  const session = await auth();
  requireOnlineStaff(session?.user?.role);

  const [student, survey] = await Promise.all([
    prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, name: true, isOnlineManaged: true },
    }),
    prisma.onboardingSurvey.findUnique({ where: { studentId } }),
  ]);
  if (!student || !student.isOnlineManaged) {
    throw new Error("온라인 관리 학생을 찾을 수 없습니다");
  }
  return { student, survey };
}

/**
 * 학생 포털에서 섹션별 자동저장.
 * 토큰으로 학생 인증 → 해당 학생의 설문만 수정 가능.
 */
export async function upsertSurveySection(params: {
  studentToken: string;
  sectionKey: string;
  answer: string;
}) {
  const { studentToken, sectionKey, answer } = params;

  if (!VALID_SECTION_KEYS.has(sectionKey)) {
    throw new Error("잘못된 섹션입니다");
  }

  const session = await validateMagicLink(studentToken);
  if (!session) throw new Error("인증이 만료되었습니다");

  const studentId = session.student.id;

  const existing = await prisma.onboardingSurvey.findUnique({
    where: { studentId },
  });

  const currentSections =
    (existing?.sections as Record<string, { answer: string }> | null) ??
    emptySurveySections();
  const nextSections = {
    ...currentSections,
    [sectionKey]: { answer },
  };

  await prisma.onboardingSurvey.upsert({
    where: { studentId },
    update: { sections: nextSections },
    create: {
      studentId,
      sections: nextSections,
    },
  });

  return { ok: true };
}

/**
 * 학생 포털에서 설문 제출 완료 표시.
 * submittedAt 이 이미 있으면 no-op. Slack 알림 fire-and-forget.
 */
export async function submitSurvey(params: { studentToken: string }) {
  const session = await validateMagicLink(params.studentToken);
  if (!session) throw new Error("인증이 만료되었습니다");

  const studentId = session.student.id;
  const student = session.student;

  const survey = await prisma.onboardingSurvey.findUnique({
    where: { studentId },
  });
  if (!survey) throw new Error("설문이 아직 작성되지 않았습니다");
  if (survey.submittedAt) {
    return { alreadySubmitted: true };
  }

  await prisma.onboardingSurvey.update({
    where: { studentId },
    data: { submittedAt: new Date() },
  });

  notifySlack(
    `[온라인 설문] ${student.name} 학생이 초기 설문을 제출했습니다. /online/students/${studentId}/survey 에서 확인하세요.`
  );

  revalidatePath(`/online/students/${studentId}`);
  revalidatePath(`/online/students/${studentId}/survey`);

  return { ok: true };
}

/**
 * 재설문(Phase 2 용도, 원장 직접 호출).
 * 기존 submittedAt 초기화 + version++. sections 는 복제(수정 시작점).
 */
export async function reviseSurvey(studentId: string) {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  const survey = await prisma.onboardingSurvey.findUnique({
    where: { studentId },
  });
  if (!survey) throw new Error("설문이 존재하지 않습니다");

  await prisma.onboardingSurvey.update({
    where: { studentId },
    data: {
      version: survey.version + 1,
      submittedAt: null,
    },
  });

  revalidatePath(`/online/students/${studentId}`);
  revalidatePath(`/online/students/${studentId}/survey`);
  return { ok: true };
}
