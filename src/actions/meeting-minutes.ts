"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { isFullAccess } from "@/lib/roles";

export type MeetingTeam = "멘토링팀" | "운영팀" | "면담";

// 열람 가능 여부 계산.
// visibleTo 비어있으면 전체 공개.
// 값 있으면 해당 user.id + 작성자 + DIRECTOR/SUPER_ADMIN 만 열람 가능.
function canRead(
  userId: string,
  userRole: string | undefined,
  authorId: string,
  visibleTo: string[]
): boolean {
  if (visibleTo.length === 0) return true;
  if (authorId === userId) return true;
  if (isFullAccess(userRole)) return true;
  return visibleTo.includes(userId);
}

export async function getMeetingMinutesList() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const userId = session.user.id;
  const role = session.user.role;

  // SQL 레벨 필터링 (응답 최소화).
  // visibleTo 가 비어있거나, 사용자가 제한 대상에 포함되거나, 작성자거나, 풀액세스면 조회.
  const rows = await prisma.meetingMinutes.findMany({
    where: isFullAccess(role)
      ? undefined
      : {
          OR: [
            { visibleTo: { isEmpty: true } },
            { authorId: userId },
            { visibleTo: { has: userId } },
          ],
        },
    include: {
      reads: { select: { userId: true, userName: true, readAt: true } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  return rows;
}

export async function createMeetingMinutes(data: {
  title: string;
  date: string;
  content: string;
  attendees: string[];
  team: MeetingTeam;
  visibleTo?: string[];
}) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const minutes = await prisma.meetingMinutes.create({
    data: {
      title: data.title.trim(),
      date: new Date(data.date),
      content: data.content.trim(),
      attendees: data.attendees.filter((a) => a.trim()),
      team: data.team,
      visibleTo: data.visibleTo?.filter(Boolean) ?? [],
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
    team?: MeetingTeam;
    visibleTo?: string[];
  }
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const existing = await prisma.meetingMinutes.findUnique({ where: { id } });
  if (!existing) throw new Error("회의록을 찾을 수 없습니다");
  if (
    existing.authorId !== session.user.id &&
    session.user.role !== "DIRECTOR" &&
    session.user.role !== "SUPER_ADMIN"
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
      ...(data.team !== undefined && { team: data.team }),
      ...(data.visibleTo !== undefined && { visibleTo: data.visibleTo.filter(Boolean) }),
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
    session.user.role !== "SUPER_ADMIN"
  ) {
    throw new Error("삭제 권한이 없습니다");
  }

  await prisma.meetingMinutes.delete({ where: { id } });
  revalidatePath("/meeting-minutes");
}

export async function markMeetingMinutesRead(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  // 열람 권한 검증 후 기록
  const existing = await prisma.meetingMinutes.findUnique({
    where: { id },
    select: { authorId: true, visibleTo: true },
  });
  if (!existing) throw new Error("회의록을 찾을 수 없습니다");
  if (!canRead(session.user.id, session.user.role, existing.authorId, existing.visibleTo)) {
    throw new Error("열람 권한이 없습니다");
  }

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
