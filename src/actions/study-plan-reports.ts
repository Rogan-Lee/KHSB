"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/roles";
import { revalidatePath } from "next/cache";
import { reportExpiresAt, checkExpiry, getRequestMeta } from "@/lib/token-auth";

export async function createStudyPlanReport(studentId: string, images: string[]) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const report = await prisma.studyPlanReport.create({
    data: {
      studentId,
      images,
      createdById: session.user.id,
      expiresAt: reportExpiresAt(),
    },
    select: { token: true },
  });

  return { token: report.token };
}

export async function getStudyPlanReport(token: string) {
  const detailed = await getStudyPlanReportDetailed(token);
  return detailed.ok ? detailed.report : null;
}

export async function getStudyPlanReportDetailed(token: string) {
  const report = await prisma.studyPlanReport.findUnique({
    where: { token },
    include: {
      student: { select: { id: true, name: true, grade: true, school: true, parentPhone: true } },
    },
  });
  if (!report) return { ok: false as const, reason: "not_found" as const };
  const fail = checkExpiry({ expiresAt: report.expiresAt, revokedAt: report.revokedAt });
  if (fail) return { ok: false as const, reason: fail };

  const { ip, ua } = await getRequestMeta();
  prisma.studyPlanReport
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

export async function revokeStudyPlanReport(reportId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireStaff(session.user.role);

  await prisma.studyPlanReport.updateMany({
    where: { id: reportId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/students");
}
