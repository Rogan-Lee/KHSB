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

export async function createConsultationReport(consultationId: string, content: string) {
  const session = await getSession();

  const consultation = await prisma.directorConsultation.findUnique({
    where: { id: consultationId, orgId: session.orgId },
    include: { student: { select: { name: true } } },
  });
  if (!consultation) throw new Error("면담 정보를 찾을 수 없습니다");

  const c = consultation as Record<string, unknown>;
  const recipientName = (consultation.student?.name ?? c.prospectName as string) || null;

  const report = await prisma.consultationReport.create({
    data: {
      orgId: session.orgId,
      consultationId,
      content,
      recipientName,
      createdById: session.id,
    },
    select: { token: true },
  });

  return { token: report.token };
}

export async function getConsultationReport(token: string) {
  // Public access by token - no org check needed
  return prisma.consultationReport.findUnique({
    where: { token },
    include: {
      consultation: {
        include: {
          student: { select: { name: true, grade: true, school: true } },
        },
      },
    },
  });
}
