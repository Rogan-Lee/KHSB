"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { CommunicationType } from "@/generated/prisma";

export async function getCommunications(studentId: string) {
  return prisma.communication.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createCommunication(
  studentId: string,
  type: CommunicationType,
  content: string
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const created = await prisma.communication.create({
    data: {
      studentId,
      type,
      content,
      createdById: session.user.id,
      createdByName: session.user.name ?? "알 수 없음",
    },
  });

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/attendance");
  return created;
}

export async function checkCommunication(id: string, studentId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.communication.update({
    where: { id },
    data: { isChecked: true, checkedAt: new Date() },
  });

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/attendance");
}

export async function deleteCommunication(id: string, studentId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.communication.delete({ where: { id } });

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/attendance");
}
