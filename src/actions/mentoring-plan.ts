"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { todayKST } from "@/lib/utils";

function assertDirector(role?: string) {
  if (role !== "DIRECTOR" && role !== "ADMIN") throw new Error("Unauthorized");
}

function assertDirectorOrMentor(role?: string) {
  if (role !== "DIRECTOR" && role !== "ADMIN" && role !== "MENTOR") throw new Error("Unauthorized");
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
  assertDirectorOrMentor(session.user.role);

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

  // 담당 학생 외에 이번 주 멘토링이 배정된 학생도 포함
  const assignedStudentIds = new Set(mentors.flatMap((m) => m.students.map((s) => s.id)));
  const extraStudentIds = [
    ...new Set(
      weekMentorings
        .filter((m) => !assignedStudentIds.has(m.studentId))
        .map((m) => m.studentId)
    ),
  ];
  const extraStudentsData =
    extraStudentIds.length > 0
      ? await prisma.student.findMany({
          where: { id: { in: extraStudentIds } },
          select: { id: true, name: true, grade: true, schedules: { select: { dayOfWeek: true } } },
        })
      : [];

  const allStudentIds = [
    ...mentors.flatMap((m) => m.students.map((s) => s.id)),
    ...extraStudentIds,
  ];

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

    // 담당 학생이 아니지만 이번 주 이 멘토에게 멘토링이 배정된 학생 추가
    const assignedIds = new Set(students.map((s) => s.id));
    const extraForMentor = weekMentorings
      .filter((m) => m.mentorId === mentor.id && !assignedIds.has(m.studentId))
      .map((m) => m.studentId);

    for (const sid of [...new Set(extraForMentor)]) {
      const extra = extraStudentsData.find((s) => s.id === sid);
      if (!extra) continue;
      const lastDate = lastMap.get(sid) ?? null;
      const daysSinceLast = lastDate
        ? Math.floor((today.getTime() - new Date(lastDate).setHours(0, 0, 0, 0)) / 86400000)
        : null;
      let priority: 1 | 2 | 3;
      if (daysSinceLast === null || daysSinceLast >= 7) priority = 1;
      else if (daysSinceLast >= 3) priority = 2;
      else priority = 3;
      const scheduledMentorings = weekMentorings
        .filter((m) => m.studentId === sid && m.mentorId === mentor.id)
        .map((m) => ({
          id: m.id,
          scheduledAt: m.scheduledAt.toISOString(),
          dayOfWeek: m.scheduledAt.getUTCDay(),
          scheduledTimeStart: m.scheduledTimeStart,
          scheduledTimeEnd: m.scheduledTimeEnd,
        }));
      students.push({
        id: extra.id,
        name: extra.name,
        grade: extra.grade,
        priority,
        daysSinceLast,
        lastMentoringDate: lastDate ? lastDate.toISOString() : null,
        expectedDays: extra.schedules.map((s) => s.dayOfWeek),
        scheduledMentorings,
      });
    }

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

