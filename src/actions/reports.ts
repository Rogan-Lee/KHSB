"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { startOfMonth, endOfMonth } from "date-fns";

export async function generateMonthlyReport(
  studentId: string,
  year: number,
  month: number
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const start = startOfMonth(new Date(year, month - 1));
  const end = endOfMonth(new Date(year, month - 1));

  const [attendances, merits, mentorings] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: {
        studentId,
        date: { gte: start, lte: end },
      },
    }),
    prisma.meritDemerit.findMany({
      where: {
        studentId,
        date: { gte: start, lte: end },
      },
    }),
    prisma.mentoring.findMany({
      where: {
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
    create: { studentId, year, month, ...stats },
    update: stats,
  });

  revalidatePath("/reports");
  return report;
}

export async function updateReportComment(
  id: string,
  overallComment: string
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.monthlyReport.update({
    where: { id },
    data: { overallComment },
  });
  revalidatePath("/reports");
}

export async function markReportSent(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.monthlyReport.update({
    where: { id },
    data: { sentAt: new Date() },
  });
  revalidatePath("/reports");
}

export async function getMonthlyReports(year: number, month: number) {
  return prisma.monthlyReport.findMany({
    where: { year, month },
    include: {
      student: { select: { id: true, name: true, grade: true, parentPhone: true } },
    },
    orderBy: { student: { name: "asc" } },
  });
}
