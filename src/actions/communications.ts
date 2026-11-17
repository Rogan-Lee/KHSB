"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireAnyStaff } from "@/lib/roles";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { afterParentRequestCreated } from "@/lib/student-instructions";
import { CommunicationType } from "@/generated/prisma";

export async function getCommunications(studentId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);

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
  requireAnyStaff(session.user.role);

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
  if (type === "PARENT_REQUEST") after(() => afterParentRequestCreated(created.id));
  return created;
}

export async function checkCommunication(id: string, studentId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);

  await prisma.$transaction([
    prisma.communication.update({
      where: { id },
      data: { isChecked: true, checkedAt: new Date() },
    }),
    // 지시 없이 확인만 한 학부모 요청 — 보내지 않은 AI 초안은 버린다
    prisma.studentInstruction.deleteMany({ where: { communicationId: id, sentAt: null } }),
  ]);

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/attendance");
  revalidatePath("/instructions");
}

export async function deleteCommunication(id: string, studentId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);

  await prisma.communication.delete({ where: { id } });

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/attendance");
}
