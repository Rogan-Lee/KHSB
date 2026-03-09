"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { ConsultationStatus } from "@/generated/prisma";

export async function createConsultation(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const raw = Object.fromEntries(formData.entries());

  await prisma.directorConsultation.create({
    data: {
      studentId: raw.studentId as string,
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
  });
}
