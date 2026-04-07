"use server";

import { getUser } from "@/lib/auth";
import { requireOrg } from "@/lib/org";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

async function getSession() {
  const org = await requireOrg();
  const user = await getUser();
  if (!user) throw new Error("인증 필요");
  return { ...user, orgId: org.orgId };
}

export async function getMessageTemplates() {
  const session = await getSession();

  return prisma.messageTemplate.findMany({
    where: { orgId: session.orgId },
    orderBy: { createdAt: "asc" },
  });
}

export async function createMessageTemplate(data: { name: string; content: string }) {
  const session = await getSession();

  const created = await prisma.messageTemplate.create({
    data: { orgId: session.orgId, ...data },
    select: { id: true, name: true, content: true, createdAt: true, updatedAt: true },
  });
  revalidatePath("/messages");
  return created;
}

export async function updateMessageTemplate(id: string, data: { name: string; content: string }) {
  const session = await getSession();

  await prisma.messageTemplate.update({ where: { id, orgId: session.orgId }, data });
  revalidatePath("/messages");
}

export async function deleteMessageTemplate(id: string) {
  const session = await getSession();

  await prisma.messageTemplate.delete({ where: { id, orgId: session.orgId } });
  revalidatePath("/messages");
}
