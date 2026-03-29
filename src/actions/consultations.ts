"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { ConsultationStatus } from "@/generated/prisma";

export async function createConsultation(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const raw = Object.fromEntries(formData.entries());
  const studentId = (raw.studentId as string) || null;
  const prospectName = (raw.prospectName as string) || null;

  if (!studentId && !prospectName) {
    throw new Error("원생을 선택하거나 신규 상담 정보를 입력하세요");
  }

  await prisma.directorConsultation.create({
    data: {
      studentId,
      prospectName,
      prospectGrade: (raw.prospectGrade as string) || null,
      prospectPhone: (raw.prospectPhone as string) || null,
      scheduledAt: raw.scheduledAt ? new Date(raw.scheduledAt as string) : null,
      agenda: (raw.agenda as string) || null,
      status: "SCHEDULED",
    },
  });

  revalidatePath("/consultations");
}

export async function updateConsultation(id: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const raw = Object.fromEntries(formData.entries());

  await prisma.directorConsultation.update({
    where: { id },
    data: {
      scheduledAt: raw.scheduledAt ? new Date(raw.scheduledAt as string) : undefined,
      actualDate: raw.actualDate ? new Date(raw.actualDate as string) : undefined,
      status: raw.status as ConsultationStatus | undefined,
      agenda: (raw.agenda as string) || null,
      notes: (raw.notes as string) || null,
      outcome: (raw.outcome as string) || null,
      followUp: (raw.followUp as string) || null,
    },
  });

  revalidatePath("/consultations");
}

export async function getConsultations() {
  return prisma.directorConsultation.findMany({
    include: {
      student: { select: { id: true, name: true, grade: true } },
    },
    orderBy: { scheduledAt: "desc" },
  }) as Promise<Array<{
    id: string;
    studentId: string | null;
    prospectName: string | null;
    prospectGrade: string | null;
    prospectPhone: string | null;
    scheduledAt: Date | null;
    actualDate: Date | null;
    status: ConsultationStatus;
    agenda: string | null;
    notes: string | null;
    outcome: string | null;
    followUp: string | null;
    student: { id: string; name: string; grade: string } | null;
  }>>;
}

export async function getStudentConsultationHistory(studentId: string, excludeId?: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  return prisma.directorConsultation.findMany({
    where: {
      studentId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      status: "COMPLETED",
    },
    orderBy: { scheduledAt: "desc" },
    take: 5,
    select: {
      id: true,
      scheduledAt: true,
      actualDate: true,
      agenda: true,
      outcome: true,
      followUp: true,
      notes: true,
    },
  });
}
