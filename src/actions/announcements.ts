"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isStaff, isOnlineStaff } from "@/lib/roles";
import { revalidatePath } from "next/cache";

// 공지 작성/수정/삭제 권한: 학생을 제외한 모든 운영진(스태프 + 온라인 관리진)
function requireAnnouncementEditor(role?: string | null) {
  if (!isStaff(role) && !isOnlineStaff(role)) throw new Error("Forbidden");
}

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
      skip,
      take,
      include: { author: { select: { name: true } } },
    }),
    prisma.announcement.count({ where: { page } }),
  ]);

  return { items, total };
}

export async function createAnnouncement(page: string, title: string, content: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnnouncementEditor(session.user.role);

  await prisma.announcement.create({
    data: { title, content, page, authorId: session.user.id },
  });

  revalidatePath("/mentoring");
}

export async function updateAnnouncement(id: string, title: string, content: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnnouncementEditor(session.user.role);

  await prisma.announcement.update({
    where: { id },
    data: { title, content, authorId: session.user.id },
  });

  revalidatePath("/mentoring");
}

export async function deleteAnnouncement(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnnouncementEditor(session.user.role);

  await prisma.announcement.delete({ where: { id } });

  revalidatePath("/mentoring");
}

export async function deleteAnnouncementsBulk(ids: string[]) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnnouncementEditor(session.user.role);

  await prisma.announcement.deleteMany({ where: { id: { in: ids } } });

  revalidatePath("/mentoring");
}
