"use server";

import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { requireOrg } from "@/lib/org";
import { revalidatePath } from "next/cache";
import { startOfMonth, endOfMonth } from "date-fns";
import { requireStaff } from "@/lib/roles";

async function getSession() {
  const org = await requireOrg();
  const user = await getUser();
  if (!user) throw new Error("인증 필요");
  return { ...user, orgId: org.orgId };
}

export async function generateMonthlyReport(
  studentId: string,
  year: number,
  month: number
) {
  const session = await getSession();
  requireStaff(session.role);

  const start = startOfMonth(new Date(year, month - 1));
  const end = endOfMonth(new Date(year, month - 1));

  const [attendances, merits, mentorings] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: {
        orgId: session.orgId,
        studentId,
        date: { gte: start, lte: end },
      },
    }),
    prisma.meritDemerit.findMany({
      where: {
        orgId: session.orgId,
        studentId,
        date: { gte: start, lte: end },
      },
    }),
    prisma.mentoring.findMany({
      where: {
        orgId: session.orgId,
        studentId,
        scheduledAt: { gte: start, lte: end },
        status: "COMPLETED",
      },
    }),
  ]);

  const stats = {
    attendanceDays: attendances.filter((a) => a.type === "NORMAL").length,
    absentDays: attendances.filter((a) => a.type === "ABSENT").length,
    tardyCount: attendances.filter((a) => a.type === "TARDY").length,
    earlyLeaveCount: attendances.filter((a) => a.type === "EARLY_LEAVE").length,
    totalMerits: merits
      .filter((m) => m.type === "MERIT")
      .reduce((acc, m) => acc + m.points, 0),
    totalDemerits: merits
      .filter((m) => m.type === "DEMERIT")
      .reduce((acc, m) => acc + m.points, 0),
    mentoringCount: mentorings.length,
  };

  const report = await prisma.monthlyReport.upsert({
    where: { studentId_year_month: { studentId, year, month } },
    create: { orgId: session.orgId, studentId, year, month, ...stats },
    update: stats,
  });

  revalidatePath("/reports");
  return report;
}

export async function updateReportComment(
  id: string,
  overallComment: string
) {
  const session = await getSession();

  await prisma.monthlyReport.update({
    where: { id, orgId: session.orgId },
    data: { overallComment },
  });
  revalidatePath("/reports");
}

export async function markReportSent(id: string) {
  const session = await getSession();

  await prisma.monthlyReport.update({
    where: { id, orgId: session.orgId },
    data: { sentAt: new Date() },
  });
  revalidatePath("/reports");
}

export async function getMonthlyReports(year: number, month: number) {
  const session = await getSession();
  requireStaff(session.role);

  return prisma.monthlyReport.findMany({
    where: { orgId: session.orgId, year, month },
    include: {
      student: { select: { id: true, name: true, grade: true, parentPhone: true } },
    },
    orderBy: { student: { name: "asc" } },
  });
}
