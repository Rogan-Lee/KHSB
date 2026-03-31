"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function createConsultationReport(consultationId: string, content: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const consultation = await prisma.directorConsultation.findUnique({
    where: { id: consultationId },
    include: { student: { select: { name: true } } },
  });
  if (!consultation) throw new Error("면담 정보를 찾을 수 없습니다");

  const c = consultation as Record<string, unknown>;
  const recipientName = (consultation.student?.name ?? c.prospectName as string) || null;

  const report = await prisma.consultationReport.create({
    data: {
      consultationId,
      content,
      recipientName,
      createdById: session.user.id,
    },
    select: { token: true },
  });

  return { token: report.token };
}

export async function getConsultationReport(token: string) {
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
