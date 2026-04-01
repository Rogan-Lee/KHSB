"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function getAssignments(studentId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  return prisma.assignment.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createAssignment(
  studentId: string,
  data: {
    title: string;
    description?: string;
    subject?: string;
    dueDate?: string;
    mentoringId?: string;
  }
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const assignment = await prisma.assignment.create({
    data: {
      studentId,
      title: data.title,
      description: data.description ?? null,
      subject: data.subject ?? null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      mentoringId: data.mentoringId ?? null,
      createdById: session.user.id,
      createdByName: session.user.name ?? "알 수 없음",
    },
  });

  revalidatePath("/assignments");
  revalidatePath(`/students/${studentId}`);
  return assignment;
}

export async function completeAssignment(id: string, studentId: string, note?: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.assignment.update({
    where: { id },
    data: {
      isCompleted: true,
      completedAt: new Date(),
      completedNote: note ?? null,
    },
  });

  revalidatePath("/assignments");
  revalidatePath(`/students/${studentId}`);
}

export async function uncompleteAssignment(id: string, studentId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.assignment.update({
    where: { id },
    data: { isCompleted: false, completedAt: null, completedNote: null },
  });

  revalidatePath("/assignments");
  revalidatePath(`/students/${studentId}`);
}

export async function updateAssignment(
  id: string,
  studentId: string,
  data: {
    title: string;
    description?: string;
    subject?: string;
    dueDate?: string;
  }
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.assignment.update({
    where: { id },
    data: {
      title: data.title,
      description: data.description ?? null,
      subject: data.subject ?? null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
    },
  });

  revalidatePath("/assignments");
  revalidatePath(`/students/${studentId}`);
}

export async function deleteAssignment(id: string, studentId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.assignment.delete({ where: { id } });

  revalidatePath("/assignments");
  revalidatePath(`/students/${studentId}`);
}
