"use server";

import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { requireOrg } from "@/lib/org";
import { revalidatePath } from "next/cache";

async function getSession() {
  const org = await requireOrg();
  const user = await getUser();
  if (!user) throw new Error("인증 필요");
  return { ...user, orgId: org.orgId };
}

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
  const session = await getSession();

  await prisma.academicPlan.upsert({
    where: { studentId_year_month: { studentId, year, month } },
    create: { orgId: session.orgId, studentId, year, month, ...data },
    update: data,
  });

  revalidatePath("/academic-plans");
  revalidatePath(`/students/${studentId}`);
}

export async function getAcademicPlans(year: number, month: number) {
  const session = await getSession();
  return prisma.academicPlan.findMany({
    where: { orgId: session.orgId, year, month },
    include: { student: { select: { id: true, name: true, grade: true } } },
  });
}

export async function getStudentAcademicPlan(
  studentId: string,
  year: number,
  month: number
) {
  const session = await getSession();
  return prisma.academicPlan.findUnique({
    where: { studentId_year_month: { studentId, year, month }, orgId: session.orgId },
  });
}
