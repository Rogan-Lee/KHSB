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

export async function createStudyPlanReport(studentId: string, images: string[]) {
  const session = await getSession();

  const report = await prisma.studyPlanReport.create({
    data: {
      orgId: session.orgId,
      studentId,
      images,
      createdById: session.id,
    },
    select: { token: true },
  });

  return { token: report.token };
}

export async function getStudyPlanReport(token: string) {
  // Public access by token - no org check needed
  return prisma.studyPlanReport.findUnique({
    where: { token },
    include: {
      student: { select: { name: true, grade: true, school: true } },
    },
  });
}
