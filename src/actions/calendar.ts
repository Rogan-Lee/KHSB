"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { CalendarEventType } from "@/generated/prisma";

export async function getCalendarEvents(params?: {
  studentId?: string;
  startDate?: Date;
  endDate?: Date;
}) {
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
}) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

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
    color?: string | null;
  }
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.calendarEvent.update({
    where: { id },
    data: {
      ...(data.title ? { title: data.title } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.startDate ? { startDate: new Date(data.startDate) } : {}),
      ...(data.endDate !== undefined ? { endDate: data.endDate ? new Date(data.endDate) : null } : {}),
      ...(data.type ? { type: data.type } : {}),
      ...(data.schoolName !== undefined ? { schoolName: data.schoolName } : {}),
      ...(data.color !== undefined ? { color: data.color } : {}),
    },
  });

  revalidatePath("/calendar");
}

export async function deleteCalendarEvent(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.calendarEvent.delete({ where: { id } });
  revalidatePath("/calendar");
}
