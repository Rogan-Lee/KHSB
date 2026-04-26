"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { parseSchool } from "@/lib/utils";

export type SchoolEventInfo = {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date | null;
  type: string;
};

export async function getTimetableEntries(studentId: string) {
  return prisma.timetableEntry.findMany({
    where: { studentId },
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
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const entry = await prisma.timetableEntry.create({
    data: {
      studentId: data.studentId,
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      endTime: data.endTime,
      subject: data.subject,
      details: data.details ?? null,
      colorCode: data.colorCode ?? "blue",
      allDay: data.allDay ?? false,
      createdById: session.user.id,
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
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  await prisma.timetableEntry.update({ where: { id }, data });
  revalidatePath("/timetable");
}

export async function deleteTimetableEntry(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  await prisma.timetableEntry.delete({ where: { id } });
  revalidatePath("/timetable");
}

export async function getStudentSchoolEvents(
  studentId: string,
  from: Date,
  to: Date,
): Promise<SchoolEventInfo[]> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { school: true },
  });
  if (!student?.school) return [];
  const schoolName = parseSchool(student.school);
  return prisma.calendarEvent.findMany({
    where: {
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
  const [schedules, outings] = await Promise.all([
    prisma.attendanceSchedule.findMany({
      where: { studentId },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    }),
    prisma.outingSchedule.findMany({
      where: { studentId },
      orderBy: [{ dayOfWeek: "asc" }, { outStart: "asc" }],
    }),
  ]);

  // 시간표 캔버스(timetable-grid)는 "HH:MM" 만 파싱 가능 — "FLEXIBLE" 이 들어가면
  // timeToMin → NaN 으로 top/height 가 망가져 블록이 콘텐츠 크기로 쪼그라든다.
  // 자율 입실 → 06:00, 자율 퇴실 → 22:00 으로 가시화. 양쪽 다 자율이면 종일 블록.
  const FLEX_START = "06:00";
  const FLEX_END = "22:00";
  const fix = (t: string, fallback: string) => (t === "FLEXIBLE" ? fallback : t);

  return [
    ...schedules.map((s) => ({
      dayOfWeek: s.dayOfWeek,
      startTime: fix(s.startTime, FLEX_START),
      endTime: fix(s.endTime, FLEX_END),
      type: "ATTENDANCE" as const,
      label:
        s.startTime === "FLEXIBLE" && s.endTime === "FLEXIBLE"
          ? "등원 (자율)"
          : s.startTime === "FLEXIBLE"
            ? "등원 (입실 자율)"
            : s.endTime === "FLEXIBLE"
              ? "등원 (퇴실 자율)"
              : "등원",
    })),
    ...outings.map((o) => ({
      dayOfWeek: o.dayOfWeek,
      startTime: fix(o.outStart, FLEX_START),
      endTime: fix(o.outEnd, FLEX_END),
      type: "OUTING" as const,
      label: o.reason ?? "외출",
    })),
  ];
}
