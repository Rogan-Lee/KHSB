"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireFullAccess } from "@/lib/roles";
import { revalidatePath } from "next/cache";

export async function getAnnouncement(page: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  return prisma.announcement.findFirst({
    where: { page },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { name: true } } },
  });
}

export async function getAnnouncementHistory(page: string, skip: number, take: number) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const [items, total] = await Promise.all([
    prisma.announcement.findMany({
      where: { page },
      orderBy: { createdAt: "desc" },
      skip: skip + 1, // 최신 1개(현재 공지)는 제외
      take,
      include: { author: { select: { name: true } } },
    }),
    prisma.announcement.count({ where: { page } }),
  ]);

  return { items, total: Math.max(total - 1, 0) }; // 현재 공지 제외한 총 수
}

export async function createAnnouncement(page: string, content: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireFullAccess(session.user.role);

  await prisma.announcement.create({
    data: { content, page, authorId: session.user.id },
  });

  revalidatePath("/mentoring");
}
