"use server";

import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { requireOrg } from "@/lib/org";
import { revalidatePath } from "next/cache";
import { parseSchool } from "@/lib/utils";

async function getSession() {
  const org = await requireOrg();
  const user = await getUser();
  if (!user) throw new Error("인증 필요");
  return { ...user, orgId: org.orgId };
}

export type SchoolEventInfo = {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date | null;
  type: string;
};

export async function getTimetableEntries(studentId: string) {
  const session = await getSession();
  return prisma.timetableEntry.findMany({
    where: { orgId: session.orgId, studentId },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
}

export async function createTimetableEntry(data: {
  studentId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  subject: string;
  details?: string;
  colorCode?: string;
  allDay?: boolean;
}) {
  const session = await getSession();

  const entry = await prisma.timetableEntry.create({
    data: {
      orgId: session.orgId,
      studentId: data.studentId,
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      endTime: data.endTime,
      subject: data.subject,
      details: data.details ?? null,
      colorCode: data.colorCode ?? "blue",
      allDay: data.allDay ?? false,
      createdById: session.id,
    },
  });
  revalidatePath("/timetable");
  return entry;
}

export async function updateTimetableEntry(
  id: string,
  data: Partial<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    subject: string;
    details: string | null;
    colorCode: string;
    allDay: boolean;
  }>
) {
  const session = await getSession();
  await prisma.timetableEntry.update({ where: { id, orgId: session.orgId }, data });
  revalidatePath("/timetable");
}

export async function deleteTimetableEntry(id: string) {
  const session = await getSession();
  await prisma.timetableEntry.delete({ where: { id, orgId: session.orgId } });
  revalidatePath("/timetable");
}

export async function getStudentSchoolEvents(
  studentId: string,
  from: Date,
  to: Date,
): Promise<SchoolEventInfo[]> {
  const session = await getSession();
  const student = await prisma.student.findUnique({
    where: { id: studentId, orgId: session.orgId },
    select: { school: true },
  });
  if (!student?.school) return [];
  const schoolName = parseSchool(student.school);
  return prisma.calendarEvent.findMany({
    where: {
      orgId: session.orgId,
      schoolName,
      type: { in: ["SCHOOL_EXAM", "SCHOOL_EVENT"] },
      startDate: { lte: to },
      OR: [{ endDate: null }, { endDate: { gte: from } }],
    },
    orderBy: { startDate: "asc" },
    select: { id: true, title: true, startDate: true, endDate: true, type: true },
  });
}

export async function getAttendanceAutoBlocks(studentId: string) {
  const session = await getSession();
  const [schedules, outings] = await Promise.all([
    prisma.attendanceSchedule.findMany({
      where: { orgId: session.orgId, studentId },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    }),
    prisma.outingSchedule.findMany({
      where: { orgId: session.orgId, studentId },
      orderBy: [{ dayOfWeek: "asc" }, { outStart: "asc" }],
    }),
  ]);

  return [
    ...schedules.map((s) => ({
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      type: "ATTENDANCE" as const,
      label: "등원",
    })),
    ...outings.map((o) => ({
      dayOfWeek: o.dayOfWeek,
      startTime: o.outStart,
      endTime: o.outEnd,
      type: "OUTING" as const,
      label: o.reason ?? "외출",
    })),
  ];
}
