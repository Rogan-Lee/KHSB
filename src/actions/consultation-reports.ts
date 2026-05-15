"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/roles";
import { revalidatePath } from "next/cache";
import { reportExpiresAt, checkExpiry, getRequestMeta } from "@/lib/token-auth";

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
      expiresAt: reportExpiresAt(),
    },
    select: { token: true },
  });

  return { token: report.token };
}

export async function getConsultationReport(token: string) {
  const detailed = await getConsultationReportDetailed(token);
  return detailed.ok ? detailed.report : null;
}

export async function getConsultationReportDetailed(token: string) {
  const report = await prisma.consultationReport.findUnique({
    where: { token },
    include: {
      consultation: {
        include: {
          student: { select: { id: true, name: true, grade: true, school: true, parentPhone: true } },
        },
      },
    },
  });
  if (!report) return { ok: false as const, reason: "not_found" as const };
  const fail = checkExpiry({ expiresAt: report.expiresAt, revokedAt: report.revokedAt });
  if (fail) return { ok: false as const, reason: fail };

  const { ip, ua } = await getRequestMeta();
  prisma.consultationReport
    .update({
      where: { id: report.id },
      data: {
        lastAccessedAt: new Date(),
        lastAccessIp: ip,
        lastAccessUa: ua,
        accessCount: { increment: 1 },
      },
    })
    .catch(() => {});

  return { ok: true as const, report };
}

export async function revokeConsultationReport(reportId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireStaff(session.user.role);

  await prisma.consultationReport.updateMany({
    where: { id: reportId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/consultations");
}
