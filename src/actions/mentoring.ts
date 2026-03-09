"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MentoringStatus } from "@/generated/prisma";
import { redirect } from "next/navigation";

const mentoringSchema = z.object({
  studentId: z.string(),
  scheduledAt: z.string(),
  notes: z.string().optional(),
  feedback: z.string().optional(),
  nextGoals: z.string().optional(),
  status: z.nativeEnum(MentoringStatus).optional(),
});

export async function createMentoring(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const raw = Object.fromEntries(formData.entries());
  const data = mentoringSchema.parse(raw);

  const mentoring = await prisma.mentoring.create({
    data: {
      studentId: data.studentId,
      mentorId: session.user.id,
      scheduledAt: new Date(data.scheduledAt),
      notes: data.notes || null,
      feedback: data.feedback || null,
      nextGoals: data.nextGoals || null,
      status: "SCHEDULED",
    },
  });

  revalidatePath("/mentoring");
  redirect(`/mentoring/${mentoring.id}`);
}

export async function updateMentoring(id: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const raw = Object.fromEntries(formData.entries());

  await prisma.mentoring.update({
    where: { id },
    data: {
      scheduledAt: raw.scheduledAt ? new Date(raw.scheduledAt as string) : undefined,
      actualDate: raw.actualDate ? new Date(raw.actualDate as string) : undefined,
      status: raw.status as MentoringStatus | undefined,
      notes: (raw.notes as string) || null,
      feedback: (raw.feedback as string) || null,
      nextGoals: (raw.nextGoals as string) || null,
    },
  });

  revalidatePath("/mentoring");
  revalidatePath(`/mentoring/${id}`);
}

export async function getMentorings(mentorId?: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const where =
    session.user.role === "MENTOR" ? { mentorId: session.user.id } :
    mentorId ? { mentorId } : undefined;

  return prisma.mentoring.findMany({
    where,
    include: {
      student: { select: { id: true, name: true, grade: true } },
      mentor: { select: { id: true, name: true } },
    },
    orderBy: { scheduledAt: "desc" },
  });
}

export async function getMentoring(id: string) {
  return prisma.mentoring.findUnique({
    where: { id },
    include: {
      student: { select: { id: true, name: true, grade: true, school: true } },
      mentor: { select: { id: true, name: true } },
    },
  });
}
