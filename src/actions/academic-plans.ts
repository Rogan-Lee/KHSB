"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function upsertAcademicPlan(
  studentId: string,
  year: number,
  month: number,
  data: {
    overallGoal?: string;
    reflection?: string;
    subjects?: Record<string, { goal: string; actual: string }>;
    weeklyGoals?: Record<string, string[]>;
  }
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.academicPlan.upsert({
    where: { studentId_year_month: { studentId, year, month } },
    create: { studentId, year, month, ...data },
    update: data,
  });

  revalidatePath("/academic-plans");
  revalidatePath(`/students/${studentId}`);
}

export async function getAcademicPlans(year: number, month: number) {
  return prisma.academicPlan.findMany({
    where: { year, month },
    include: { student: { select: { id: true, name: true, grade: true } } },
  });
}

export async function getStudentAcademicPlan(
  studentId: string,
  year: number,
  month: number
) {
  return prisma.academicPlan.findUnique({
    where: { studentId_year_month: { studentId, year, month } },
  });
}
