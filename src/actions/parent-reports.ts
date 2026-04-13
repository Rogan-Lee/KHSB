"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function createParentReport(
  mentoringId: string,
  data: {
    studyPlanImages?: string[];
    customNote?: string;
  }
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const mentoring = await prisma.mentoring.findUnique({
    where: { id: mentoringId },
    select: { studentId: true, notes: true },
  });
  if (!mentoring) throw new Error("멘토링을 찾을 수 없습니다");

  const report = await prisma.parentReport.create({
    data: {
      studentId: mentoring.studentId,
      mentoringId,
      studyPlanImages: data.studyPlanImages ?? [],
      customNote: data.customNote || mentoring.notes || null,
      createdById: session.user.id,
    },
    select: { token: true },
  });

  return { token: report.token };
}

export async function getParentReport(token: string) {
  return prisma.parentReport.findUnique({
    where: { token },
    include: {
      student: {
        select: { id: true, name: true, grade: true, school: true },
      },
      mentoring: {
        select: {
          scheduledAt: true,
          actualDate: true,
          actualStartTime: true,
          actualEndTime: true,
          status: true,
          content: true,
          improvements: true,
          weaknesses: true,
          nextGoals: true,
          notes: true,
          mentor: { select: { name: true } },
        },
      },
    },
  });
}
