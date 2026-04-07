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

export type MeetingTeam = "멘토링팀" | "운영팀";

export async function getMeetingMinutesList() {
  const session = await getSession();

  return prisma.meetingMinutes.findMany({
    where: { orgId: session.orgId },
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
  team: MeetingTeam;
}) {
  const session = await getSession();

  const minutes = await prisma.meetingMinutes.create({
    data: {
      orgId: session.orgId,
      title: data.title.trim(),
      date: new Date(data.date),
      content: data.content.trim(),
      attendees: data.attendees.filter((a) => a.trim()),
      team: data.team,
      authorId: session.id,
      authorName: session.name ?? "알 수 없음",
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
    team?: MeetingTeam;
  }
) {
  const session = await getSession();

  const existing = await prisma.meetingMinutes.findUnique({ where: { id, orgId: session.orgId } });
  if (!existing) throw new Error("회의록을 찾을 수 없습니다");
  if (
    existing.authorId !== session.id &&
    session.role !== "DIRECTOR" &&
    session.role !== "ADMIN"
  ) {
    throw new Error("수정 권한이 없습니다");
  }

  const minutes = await prisma.meetingMinutes.update({
    where: { id, orgId: session.orgId },
    data: {
      ...(data.title !== undefined && { title: data.title.trim() }),
      ...(data.date !== undefined && { date: new Date(data.date) }),
      ...(data.content !== undefined && { content: data.content.trim() }),
      ...(data.attendees !== undefined && { attendees: data.attendees.filter((a) => a.trim()) }),
      ...(data.team !== undefined && { team: data.team }),
    },
    include: {
      reads: { select: { userId: true, userName: true, readAt: true } },
    },
  });

  revalidatePath("/meeting-minutes");
  return minutes;
}

export async function deleteMeetingMinutes(id: string) {
  const session = await getSession();

  const existing = await prisma.meetingMinutes.findUnique({ where: { id, orgId: session.orgId } });
  if (!existing) throw new Error("회의록을 찾을 수 없습니다");
  if (
    existing.authorId !== session.id &&
    session.role !== "DIRECTOR" &&
    session.role !== "ADMIN"
  ) {
    throw new Error("삭제 권한이 없습니다");
  }

  await prisma.meetingMinutes.delete({ where: { id, orgId: session.orgId } });
  revalidatePath("/meeting-minutes");
}

export async function markMeetingMinutesRead(id: string) {
  const session = await getSession();

  await prisma.meetingMinutesRead.upsert({
    where: { meetingMinutesId_userId: { meetingMinutesId: id, userId: session.id } },
    create: {
      orgId: session.orgId,
      meetingMinutesId: id,
      userId: session.id,
      userName: session.name ?? "알 수 없음",
    },
    update: { readAt: new Date() },
  });

  revalidatePath("/meeting-minutes");
}
