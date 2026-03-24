"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getMeetingMinutesList() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  return prisma.meetingMinutes.findMany({
    include: {
      reads: { select: { userId: true, userName: true, readAt: true } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
}

export async function createMeetingMinutes(data: {
  title: string;
  date: string;
  content: string;
  attendees: string[];
}) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const minutes = await prisma.meetingMinutes.create({
    data: {
      title: data.title.trim(),
      date: new Date(data.date),
      content: data.content.trim(),
      attendees: data.attendees.filter((a) => a.trim()),
      authorId: session.user.id,
      authorName: session.user.name ?? "알 수 없음",
    },
    include: {
      reads: { select: { userId: true, userName: true, readAt: true } },
    },
  });

  revalidatePath("/meeting-minutes");
  return minutes;
}

export async function updateMeetingMinutes(
  id: string,
  data: {
    title?: string;
    date?: string;
    content?: string;
    attendees?: string[];
  }
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const existing = await prisma.meetingMinutes.findUnique({ where: { id } });
  if (!existing) throw new Error("회의록을 찾을 수 없습니다");
  if (
    existing.authorId !== session.user.id &&
    session.user.role !== "DIRECTOR" &&
    session.user.role !== "ADMIN"
  ) {
    throw new Error("수정 권한이 없습니다");
  }

  const minutes = await prisma.meetingMinutes.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title.trim() }),
      ...(data.date !== undefined && { date: new Date(data.date) }),
      ...(data.content !== undefined && { content: data.content.trim() }),
      ...(data.attendees !== undefined && { attendees: data.attendees.filter((a) => a.trim()) }),
    },
    include: {
      reads: { select: { userId: true, userName: true, readAt: true } },
    },
  });

  revalidatePath("/meeting-minutes");
  return minutes;
}

export async function deleteMeetingMinutes(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const existing = await prisma.meetingMinutes.findUnique({ where: { id } });
  if (!existing) throw new Error("회의록을 찾을 수 없습니다");
  if (
    existing.authorId !== session.user.id &&
    session.user.role !== "DIRECTOR" &&
    session.user.role !== "ADMIN"
  ) {
    throw new Error("삭제 권한이 없습니다");
  }

  await prisma.meetingMinutes.delete({ where: { id } });
  revalidatePath("/meeting-minutes");
}

export async function markMeetingMinutesRead(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.meetingMinutesRead.upsert({
    where: { meetingMinutesId_userId: { meetingMinutesId: id, userId: session.user.id } },
    create: {
      meetingMinutesId: id,
      userId: session.user.id,
      userName: session.user.name ?? "알 수 없음",
    },
    update: { readAt: new Date() },
  });

  revalidatePath("/meeting-minutes");
}
