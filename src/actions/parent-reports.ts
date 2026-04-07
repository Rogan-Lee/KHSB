"use server";

import { getUser } from "@/lib/auth";
import { requireOrg } from "@/lib/org";
import { prisma } from "@/lib/prisma";

async function getSession() {
  const org = await requireOrg();
  const user = await getUser();
  if (!user) throw new Error("인증 필요");
  return { ...user, orgId: org.orgId };
}

export async function createParentReport(
  mentoringId: string,
  data: {
    studyPlanImages?: string[];
  }
) {
  const session = await getSession();

  const mentoring = await prisma.mentoring.findUnique({
    where: { id: mentoringId, orgId: session.orgId },
    select: { studentId: true, notes: true },
  });
  if (!mentoring) throw new Error("멘토링을 찾을 수 없습니다");

  const report = await prisma.parentReport.create({
    data: {
      orgId: session.orgId,
      studentId: mentoring.studentId,
      mentoringId,
      studyPlanImages: data.studyPlanImages ?? [],
      customNote: mentoring.notes || null,
      createdById: session.id,
    },
    select: { token: true },
  });

  return { token: report.token };
}

export async function getParentReport(token: string) {
  // Public access by token - no org check needed
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
