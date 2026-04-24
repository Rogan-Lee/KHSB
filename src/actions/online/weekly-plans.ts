"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireManagerMentor } from "@/lib/roles";

/** Record<subject, goalText> 형태의 goals JSON. */
export type WeeklyPlanGoals = Record<string, string>;

/**
 * 주간 계획 upsert (studentId + weekStart unique).
 * 관리 멘토 또는 FullAccess 만 호출.
 */
export async function saveWeeklyPlan(params: {
  studentId: string;
  weekStart: string; // "YYYY-MM-DD"
  goals: WeeklyPlanGoals;
  studyHours?: number | null;
  retrospective?: string | null;
}) {
  const session = await auth();
  requireManagerMentor(session?.user?.role);

  const student = await prisma.student.findUnique({
    where: { id: params.studentId },
    select: { id: true, isOnlineManaged: true },
  });
  if (!student || !student.isOnlineManaged) {
    throw new Error("온라인 관리 학생을 찾을 수 없습니다");
  }

  const weekDate = new Date(params.weekStart + "T00:00:00.000Z");
  if (weekDate.getUTCDay() !== 1) {
    throw new Error("주 시작일은 월요일이어야 합니다");
  }

  // goals 에서 빈 값 제거
  const cleanGoals: WeeklyPlanGoals = {};
  for (const [k, v] of Object.entries(params.goals)) {
    const trimmed = v.trim();
    if (trimmed.length > 0) cleanGoals[k] = trimmed;
  }

  await prisma.weeklyPlan.upsert({
    where: {
      studentId_weekStart: { studentId: params.studentId, weekStart: weekDate },
    },
    update: {
      goals: cleanGoals,
      studyHours: params.studyHours ?? null,
      retrospective: params.retrospective?.trim() || null,
    },
    create: {
      studentId: params.studentId,
      weekStart: weekDate,
      goals: cleanGoals,
      studyHours: params.studyHours ?? null,
      retrospective: params.retrospective?.trim() || null,
      authorId: session!.user.id,
    },
  });

  revalidatePath(`/online/students/${params.studentId}/plans`);
  revalidatePath(`/online/students/${params.studentId}`);
}
