"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { todayKST } from "@/lib/utils";

function assertDirector(role?: string) {
  if (role !== "DIRECTOR" && role !== "ADMIN") throw new Error("Unauthorized");
}

export type WeeklyPlanStudent = {
  id: string;
  name: string;
  grade: string;
  priority: 1 | 2 | 3;
  daysSinceLast: number | null;
  lastMentoringDate: string | null;
  expectedDays: number[];
  scheduledMentorings: {
    id: string;
    scheduledAt: string;
    dayOfWeek: number;
    scheduledTimeStart: string | null;
    scheduledTimeEnd: string | null;
  }[];
};

export type WeeklyPlanMentor = {
  id: string;
  name: string;
  workDays: { id: string; dayOfWeek: number; timeStart: string; timeEnd: string }[];
  students: WeeklyPlanStudent[];
};

export async function getWeeklyPlanData(weekStart: string): Promise<WeeklyPlanMentor[]> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  assertDirector(session.user.role);

  const weekStartDate = new Date(weekStart);
  const weekEndDate = new Date(weekStartDate.getTime() + 7 * 24 * 60 * 60 * 1000);

  const mentors = await prisma.user.findMany({
    where: {
      role: { in: ["MENTOR", "STAFF", "DIRECTOR", "ADMIN"] },
      mentorSchedules: { some: {} },
    },
    include: {
      mentorSchedules: { orderBy: { dayOfWeek: "asc" } },
      students: {
        where: { status: "ACTIVE" },
        select: {
          id: true,
          name: true,
          grade: true,
          schedules: { select: { dayOfWeek: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  if (mentors.length === 0) return [];

  const allStudentIds = mentors.flatMap((m) => m.students.map((s) => s.id));

  const lastMentorings = await prisma.mentoring.findMany({
    where: {
      studentId: { in: allStudentIds },
      status: { not: "CANCELLED" },
    },
    orderBy: { scheduledAt: "desc" },
    distinct: ["studentId"],
    select: { studentId: true, scheduledAt: true },
  });
  const lastMap = new Map(lastMentorings.map((m) => [m.studentId, m.scheduledAt]));

  const weekMentorings = await prisma.mentoring.findMany({
    where: {
      scheduledAt: { gte: weekStartDate, lt: weekEndDate },
      status: "SCHEDULED",
    },
    select: {
      id: true,
      studentId: true,
      mentorId: true,
      scheduledAt: true,
      scheduledTimeStart: true,
      scheduledTimeEnd: true,
    },
  });

  const today = todayKST();

  return mentors.map((mentor) => {
    const students: WeeklyPlanStudent[] = mentor.students.map((student) => {
      const lastDate = lastMap.get(student.id) ?? null;
      const daysSinceLast = lastDate
        ? Math.floor((today.getTime() - new Date(lastDate).setHours(0, 0, 0, 0)) / 86400000)
        : null;

      let priority: 1 | 2 | 3;
      if (daysSinceLast === null || daysSinceLast >= 7) priority = 1;
      else if (daysSinceLast >= 3) priority = 2;
      else priority = 3;

      const scheduledMentorings = weekMentorings
        .filter((m) => m.studentId === student.id && m.mentorId === mentor.id)
        .map((m) => ({
          id: m.id,
          scheduledAt: m.scheduledAt.toISOString(),
          dayOfWeek: m.scheduledAt.getUTCDay(),
          scheduledTimeStart: m.scheduledTimeStart,
          scheduledTimeEnd: m.scheduledTimeEnd,
        }));

      return {
        id: student.id,
        name: student.name,
        grade: student.grade,
        priority,
        daysSinceLast,
        lastMentoringDate: lastDate ? lastDate.toISOString() : null,
        expectedDays: student.schedules.map((s) => s.dayOfWeek),
        scheduledMentorings,
      };
    });

    students.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return (b.daysSinceLast ?? 9999) - (a.daysSinceLast ?? 9999);
    });

    return {
      id: mentor.id,
      name: mentor.name,
      workDays: mentor.mentorSchedules.map((s) => ({
        id: s.id,
        dayOfWeek: s.dayOfWeek,
        timeStart: s.timeStart,
        timeEnd: s.timeEnd,
      })),
      students,
    };
  });
}

export async function scheduleWeeklyMentoring(
  studentId: string,
  mentorId: string,
  date: string,
  timeStart?: string,
  timeEnd?: string
): Promise<{ id: string }> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  assertDirector(session.user.role);

  const mentoring = await prisma.mentoring.create({
    data: {
      studentId,
      mentorId,
      scheduledAt: new Date(date),
      scheduledTimeStart: timeStart ?? null,
      scheduledTimeEnd: timeEnd ?? null,
      status: "SCHEDULED",
    },
  });

  revalidatePath("/mentoring-plan");
  revalidatePath("/mentoring");
  return { id: mentoring.id };
}

export async function cancelWeeklyMentoring(id: string): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  assertDirector(session.user.role);

  await prisma.mentoring.delete({ where: { id } });
  revalidatePath("/mentoring-plan");
  revalidatePath("/mentoring");
}
