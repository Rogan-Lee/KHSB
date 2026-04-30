"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireManagerMentor } from "@/lib/roles";

/** Record<subject, goalText> — 과목별 월간 목표. */
export type MonthlyGoals = Record<string, string>;

/** Record<YYYY-MM-DD, label> — 해당 월 마일스톤. */
export type MonthlyMilestones = Record<string, string>;

export async function saveMonthlyPlan(params: {
  studentId: string;
  yearMonth: string; // "2026-05"
  subjectGoals: MonthlyGoals;
  milestones: MonthlyMilestones;
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
  if (!/^\d{4}-\d{2}$/.test(params.yearMonth)) {
    throw new Error("yearMonth 는 YYYY-MM 형식이어야 합니다");
  }

  // 빈 값 제거
  const cleanGoals: MonthlyGoals = {};
  for (const [k, v] of Object.entries(params.subjectGoals)) {
    const trimmed = v.trim();
    if (trimmed) cleanGoals[k] = trimmed;
  }
  const cleanMilestones: MonthlyMilestones = {};
  for (const [k, v] of Object.entries(params.milestones)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
    const trimmed = v.trim();
    if (trimmed) cleanMilestones[k] = trimmed;
  }

  await prisma.monthlyPlan.upsert({
    where: {
      studentId_yearMonth: {
        studentId: params.studentId,
        yearMonth: params.yearMonth,
      },
    },
    update: {
      subjectGoals: cleanGoals,
      milestones: cleanMilestones,
      retrospective: params.retrospective?.trim() || null,
    },
    create: {
      studentId: params.studentId,
      yearMonth: params.yearMonth,
      subjectGoals: cleanGoals,
      milestones: cleanMilestones,
      retrospective: params.retrospective?.trim() || null,
      authorId: session!.user.id,
    },
  });

  revalidatePath(`/online/students/${params.studentId}/monthly`);
  revalidatePath(`/online/students/${params.studentId}`);
}
