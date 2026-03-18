"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { HandoverPriority } from "@/generated/prisma";

export async function getHandovers(options?: { date?: string; limit?: number }) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const where = options?.date
    ? { date: new Date(options.date) }
    : undefined;

  return prisma.handover.findMany({
    where,
    include: {
      reads: { select: { userId: true, userName: true, readAt: true } },
    },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    take: options?.limit,
  });
}

export async function getRecentHandovers(days = 7) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  return prisma.handover.findMany({
    where: { date: { gte: since } },
    include: {
      reads: { select: { userId: true, userName: true, readAt: true } },
    },
    orderBy: [{ date: "desc" }, { isPinned: "desc" }, { createdAt: "desc" }],
  });
}

export async function createHandover(data: {
  content: string;
  priority?: HandoverPriority;
  category?: string;
  isPinned?: boolean;
  date?: string;
}) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const today = data.date ? new Date(data.date) : new Date();
  today.setHours(0, 0, 0, 0);

  const handover = await prisma.handover.create({
    data: {
      content: data.content.trim(),
      priority: data.priority ?? "NORMAL",
      category: data.category?.trim() || null,
      isPinned: data.isPinned ?? false,
      date: today,
      authorId: session.user.id,
      authorName: session.user.name ?? "알 수 없음",
    },
    include: {
      reads: { select: { userId: true, userName: true, readAt: true } },
    },
  });

  revalidatePath("/handover");
  return handover;
}

export async function updateHandover(
  id: string,
  data: { content?: string; priority?: HandoverPriority; category?: string; isPinned?: boolean }
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const existing = await prisma.handover.findUnique({ where: { id } });
  if (!existing) throw new Error("인수인계를 찾을 수 없습니다");
  if (existing.authorId !== session.user.id && session.user.role !== "DIRECTOR" && session.user.role !== "ADMIN") {
    throw new Error("수정 권한이 없습니다");
  }

  const handover = await prisma.handover.update({
    where: { id },
    data: {
      ...(data.content !== undefined && { content: data.content.trim() }),
      ...(data.priority !== undefined && { priority: data.priority }),
      ...(data.category !== undefined && { category: data.category?.trim() || null }),
      ...(data.isPinned !== undefined && { isPinned: data.isPinned }),
    },
    include: {
      reads: { select: { userId: true, userName: true, readAt: true } },
    },
  });

  revalidatePath("/handover");
  return handover;
}

export async function deleteHandover(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const existing = await prisma.handover.findUnique({ where: { id } });
  if (!existing) throw new Error("인수인계를 찾을 수 없습니다");
  if (existing.authorId !== session.user.id && session.user.role !== "DIRECTOR" && session.user.role !== "ADMIN") {
    throw new Error("삭제 권한이 없습니다");
  }

  await prisma.handover.delete({ where: { id } });
  revalidatePath("/handover");
}

export async function markHandoverRead(handoverId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.handoverRead.upsert({
    where: { handoverId_userId: { handoverId, userId: session.user.id } },
    create: {
      handoverId,
      userId: session.user.id,
      userName: session.user.name ?? "알 수 없음",
    },
    update: { readAt: new Date() },
  });

  revalidatePath("/handover");
}

export async function togglePin(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const existing = await prisma.handover.findUnique({ where: { id }, select: { isPinned: true } });
  if (!existing) throw new Error("인수인계를 찾을 수 없습니다");

  await prisma.handover.update({ where: { id }, data: { isPinned: !existing.isPinned } });
  revalidatePath("/handover");
}
