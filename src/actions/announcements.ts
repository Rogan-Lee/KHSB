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
    orderBy: { updatedAt: "desc" },
    include: { author: { select: { name: true } } },
  });
}

export async function upsertAnnouncement(page: string, content: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireFullAccess(session.user.role);

  // 해당 페이지의 기존 공지가 있으면 업데이트, 없으면 생성
  const existing = await prisma.announcement.findFirst({
    where: { page },
    orderBy: { updatedAt: "desc" },
  });

  if (existing) {
    await prisma.announcement.update({
      where: { id: existing.id },
      data: { content, authorId: session.user.id },
    });
  } else {
    await prisma.announcement.create({
      data: { content, page, authorId: session.user.id },
    });
  }

  revalidatePath("/mentoring");
}
