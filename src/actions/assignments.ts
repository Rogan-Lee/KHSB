"use server";

import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { requireOrg } from "@/lib/org";
import { revalidatePath } from "next/cache";

async function getSession() {
  const org = await requireOrg();
  const user = await getUser();
  if (!user) throw new Error("인증 필요");
  return { ...user, orgId: org.orgId };
}

export async function getAssignments(studentId: string) {
  const session = await getSession();

  return prisma.assignment.findMany({
    where: { orgId: session.orgId, studentId },
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
  const session = await getSession();

  const assignment = await prisma.assignment.create({
    data: {
      orgId: session.orgId,
      studentId,
      title: data.title,
      description: data.description ?? null,
      subject: data.subject ?? null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      mentoringId: data.mentoringId ?? null,
      createdById: session.id,
      createdByName: session.name ?? "알 수 없음",
    },
  });

  revalidatePath("/assignments");
  revalidatePath(`/students/${studentId}`);
  return assignment;
}

export async function completeAssignment(id: string, studentId: string, note?: string) {
  const session = await getSession();

  await prisma.assignment.update({
    where: { id, orgId: session.orgId },
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
  const session = await getSession();

  await prisma.assignment.update({
    where: { id, orgId: session.orgId },
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
  const session = await getSession();

  await prisma.assignment.update({
    where: { id, orgId: session.orgId },
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
  const session = await getSession();

  await prisma.assignment.delete({ where: { id, orgId: session.orgId } });

  revalidatePath("/assignments");
  revalidatePath(`/students/${studentId}`);
}
