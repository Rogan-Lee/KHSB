"use server";

import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { requireOrg } from "@/lib/org";
import { revalidatePath } from "next/cache";
import { CommunicationType } from "@/generated/prisma";

async function getSession() {
  const org = await requireOrg();
  const user = await getUser();
  if (!user) throw new Error("인증 필요");
  return { ...user, orgId: org.orgId };
}

export async function getCommunications(studentId: string) {
  const session = await getSession();
  return prisma.communication.findMany({
    where: { orgId: session.orgId, studentId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createCommunication(
  studentId: string,
  type: CommunicationType,
  content: string
) {
  const session = await getSession();

  const created = await prisma.communication.create({
    data: {
      orgId: session.orgId,
      studentId,
      type,
      content,
      createdById: session.id,
      createdByName: session.name ?? "알 수 없음",
    },
  });

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/attendance");
  return created;
}

export async function checkCommunication(id: string, studentId: string) {
  const session = await getSession();

  await prisma.communication.update({
    where: { id, orgId: session.orgId },
    data: { isChecked: true, checkedAt: new Date() },
  });

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/attendance");
}

export async function deleteCommunication(id: string, studentId: string) {
  const session = await getSession();

  await prisma.communication.delete({ where: { id, orgId: session.orgId } });

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/attendance");
}
