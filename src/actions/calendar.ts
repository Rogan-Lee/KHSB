"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { CalendarEventType } from "@/generated/prisma";
import { todayKST } from "@/lib/utils";
import {
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
} from "@/actions/google-calendar";

export async function getCalendarEvents(params?: {
  studentId?: string;
  startDate?: Date;
  endDate?: Date;
}) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const where: Record<string, unknown> = {};

  if (params?.studentId) {
    where.OR = [
      { studentId: params.studentId },
      { studentId: null },
    ];
  }

  if (params?.startDate || params?.endDate) {
    where.startDate = {
      ...(params.startDate ? { gte: params.startDate } : {}),
      ...(params.endDate ? { lte: params.endDate } : {}),
    };
  }

  return prisma.calendarEvent.findMany({
    where,
    include: {
      student: { select: { id: true, name: true } },
    },
    orderBy: { startDate: "asc" },
  });
}

export async function createCalendarEvent(data: {
  title: string;
  description?: string;
  startDate: string;
  endDate?: string;
  allDay?: boolean;
  type: CalendarEventType;
  studentId?: string;
  schoolName?: string;
  color?: string;
  syncToGoogle?: boolean;
}) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  // Google Calendar 동기화 (선택)
  let googleEventId: string | null = null;
  if (data.syncToGoogle) {
    googleEventId = await createGoogleCalendarEvent({
      title: data.title,
      description: data.description,
      startDate: data.startDate,
      endDate: data.endDate,
      allDay: data.allDay ?? true,
    });
  }

  const record = await prisma.calendarEvent.create({
    data: {
      title: data.title,
      description: data.description ?? null,
      startDate: new Date(data.startDate),
      endDate: data.endDate ? new Date(data.endDate) : null,
      allDay: data.allDay ?? true,
      type: data.type,
      studentId: data.studentId ?? null,
      schoolName: data.schoolName ?? null,
      color: data.color ?? null,
      googleEventId,
      createdById: session.user.id,
    },
  });

  revalidatePath("/calendar");
  return record;
}

export async function updateCalendarEvent(
  id: string,
  data: {
    title?: string;
    description?: string;
    startDate?: string;
    endDate?: string;
    type?: CalendarEventType;
    schoolName?: string;
    studentId?: string | null;
    color?: string | null;
  }
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const existing = await prisma.calendarEvent.findUnique({ where: { id }, select: { googleEventId: true, allDay: true } });

  // Google Calendar 동기화 (googleEventId가 있는 경우)
  if (existing?.googleEventId) {
    await updateGoogleCalendarEvent(existing.googleEventId, {
      title: data.title,
      description: data.description,
      startDate: data.startDate,
      endDate: data.endDate,
      allDay: existing.allDay,
    });
  }

  await prisma.calendarEvent.update({
    where: { id },
    data: {
      ...(data.title ? { title: data.title } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.startDate ? { startDate: new Date(data.startDate) } : {}),
      ...(data.endDate !== undefined ? { endDate: data.endDate ? new Date(data.endDate) : null } : {}),
      ...(data.type ? { type: data.type } : {}),
      ...(data.schoolName !== undefined ? { schoolName: data.schoolName } : {}),
      ...(data.studentId !== undefined ? { studentId: data.studentId } : {}),
      ...(data.color !== undefined ? { color: data.color } : {}),
    },
  });

  revalidatePath("/calendar");
}

export async function getStudentUpcomingEvents(studentId: string, school: string | null) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const today = todayKST();
  const twoWeeksLater = new Date(today);
  twoWeeksLater.setDate(twoWeeksLater.getDate() + 14);

  // school 필드에서 순수 학교명 추출 (예: "반송고2" → "반송고")
  const schoolName = school
    ? school.replace(/\d+$/, "").trim()
    : null;

  const [schoolEvents, personalEvents] = await Promise.all([
    schoolName
      ? prisma.calendarEvent.findMany({
          where: {
            schoolName,
            type: { in: ["SCHOOL_EXAM", "SCHOOL_EVENT"] },
            startDate: { gte: today, lte: twoWeeksLater },
          },
          orderBy: { startDate: "asc" },
        })
      : Promise.resolve([]),
    prisma.calendarEvent.findMany({
      where: {
        studentId,
        type: "PERSONAL",
        startDate: { gte: today, lte: twoWeeksLater },
      },
      orderBy: { startDate: "asc" },
    }),
  ]);

  return { schoolEvents, personalEvents };
}

export async function deleteCalendarEvent(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const existing = await prisma.calendarEvent.findUnique({ where: { id }, select: { googleEventId: true } });

  // Google Calendar에서도 삭제
  if (existing?.googleEventId) {
    await deleteGoogleCalendarEvent(existing.googleEventId);
  }

  await prisma.calendarEvent.delete({ where: { id } });
  revalidatePath("/calendar");
}

export async function getStudentCalendarEvents(params: {
  studentId: string;
  schoolName: string | null;
  startDate: Date;
  endDate: Date;
}) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const { studentId, schoolName, startDate, endDate } = params;

  const [personalEvents, schoolEvents] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: { studentId, startDate: { gte: startDate, lte: endDate } },
      include: { student: { select: { id: true, name: true } } },
      orderBy: { startDate: "asc" },
    }),
    schoolName
      ? prisma.calendarEvent.findMany({
          where: {
            schoolName,
            type: { in: ["SCHOOL_EXAM", "SCHOOL_EVENT"] },
            startDate: { gte: startDate, lte: endDate },
          },
          include: { student: { select: { id: true, name: true } } },
          orderBy: { startDate: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const personalIds = new Set(personalEvents.map((e) => e.id));
  return [
    ...personalEvents,
    ...schoolEvents.filter((e) => !personalIds.has(e.id)),
  ];
}
