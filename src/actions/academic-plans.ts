"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireAnyStaff } from "@/lib/roles";
import { revalidatePath } from "next/cache";

async function requireStaffSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);
  return session;
}

function assertYearMonth(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error("연도가 올바르지 않습니다");
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error("월이 올바르지 않습니다");
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
  await requireStaffSession();
  assertYearMonth(year, month);

  // 클라이언트 객체를 그대로 spread 하면 studentId/year/month 등 키 컬럼까지 덮어쓸 수 있으므로
  // 허용 필드만 골라 저장한다.
  const fields = {
    ...(data.overallGoal !== undefined && { overallGoal: String(data.overallGoal).slice(0, 5000) }),
    ...(data.reflection !== undefined && { reflection: String(data.reflection).slice(0, 5000) }),
    ...(data.subjects !== undefined && { subjects: data.subjects }),
    ...(data.weeklyGoals !== undefined && { weeklyGoals: data.weeklyGoals }),
  };

  await prisma.academicPlan.upsert({
    where: { studentId_year_month: { studentId, year, month } },
    create: { studentId, year, month, ...fields },
    update: fields,
  });

  revalidatePath("/academic-plans");
  revalidatePath(`/students/${studentId}`);
}

export async function getAcademicPlans(year: number, month: number) {
  await requireStaffSession();
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
  await requireStaffSession();
  return prisma.academicPlan.findUnique({
    where: { studentId_year_month: { studentId, year, month } },
  });
}
