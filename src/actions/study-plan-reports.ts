"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function createStudyPlanReport(studentId: string, images: string[]) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const report = await prisma.studyPlanReport.create({
    data: {
      studentId,
      images,
      createdById: session.user.id,
    },
    select: { token: true },
  });

  return { token: report.token };
}

export async function getStudyPlanReport(token: string) {
  return prisma.studyPlanReport.findUnique({
    where: { token },
    include: {
      student: { select: { name: true, grade: true, school: true } },
    },
  });
}
