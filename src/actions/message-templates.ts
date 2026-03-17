"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getMessageTemplates() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  return prisma.messageTemplate.findMany({
    orderBy: { createdAt: "asc" },
  });
}

export async function createMessageTemplate(data: { name: string; content: string }) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const created = await prisma.messageTemplate.create({ data, select: { id: true, name: true, content: true, createdAt: true, updatedAt: true } });
  revalidatePath("/messages");
  return created;
}

export async function updateMessageTemplate(id: string, data: { name: string; content: string }) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.messageTemplate.update({ where: { id }, data });
  revalidatePath("/messages");
}

export async function deleteMessageTemplate(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.messageTemplate.delete({ where: { id } });
  revalidatePath("/messages");
}
