"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AttendanceType } from "@/generated/prisma";

const recordSchema = z.object({
  studentId: z.string(),
  date: z.string(),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  type: z.nativeEnum(AttendanceType),
  notes: z.string().optional(),
});

function toDateTime(dateStr: string, timeStr?: string) {
  if (!timeStr) return null;
  return new Date(`${dateStr}T${timeStr}:00`);
}

export async function upsertAttendance(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const raw = Object.fromEntries(formData.entries());
  const data = recordSchema.parse(raw);

  await prisma.attendanceRecord.upsert({
    where: {
      studentId_date: {
        studentId: data.studentId,
        date: new Date(data.date),
      },
    },
    create: {
      studentId: data.studentId,
      date: new Date(data.date),
      checkIn: toDateTime(data.date, raw.checkIn as string),
      checkOut: toDateTime(data.date, raw.checkOut as string),
      type: data.type,
      notes: data.notes || null,
    },
    update: {
      checkIn: toDateTime(data.date, raw.checkIn as string),
      checkOut: toDateTime(data.date, raw.checkOut as string),
      type: data.type,
      notes: data.notes || null,
    },
  });

  revalidatePath("/attendance");
  revalidatePath(`/students/${data.studentId}`);
}

export async function getTodayAttendance() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const students = await prisma.student.findMany({
    where: { status: "ACTIVE" },
    include: {
      attendances: {
        where: { date: today },
      },
      schedules: {
        where: { dayOfWeek: today.getDay() },
      },
    },
    orderBy: { name: "asc" },
  });

  return students;
}

export async function getAttendanceByDate(date: Date) {
  return prisma.attendanceRecord.findMany({
    where: { date },
    include: { student: { select: { id: true, name: true, seat: true } } },
  });
}

export async function saveAttendanceRecord(data: {
  studentId: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  type: AttendanceType;
  notes?: string;
}) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  function toDateTime(dateStr: string, timeStr?: string) {
    if (!timeStr) return null;
    return new Date(`${dateStr}T${timeStr}:00`);
  }

  await prisma.attendanceRecord.upsert({
    where: {
      studentId_date: {
        studentId: data.studentId,
        date: new Date(data.date),
      },
    },
    create: {
      studentId: data.studentId,
      date: new Date(data.date),
      checkIn: toDateTime(data.date, data.checkIn),
      checkOut: toDateTime(data.date, data.checkOut),
      type: data.type,
      notes: data.notes || null,
    },
    update: {
      checkIn: toDateTime(data.date, data.checkIn),
      checkOut: toDateTime(data.date, data.checkOut),
      type: data.type,
      notes: data.notes || null,
    },
  });

  revalidatePath("/attendance");
  revalidatePath(`/students/${data.studentId}`);
}

export async function saveAttendanceSchedule(
  studentId: string,
  schedules: { dayOfWeek: number; startTime: string; endTime: string }[]
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.attendanceSchedule.deleteMany({ where: { studentId } });
  if (schedules.length > 0) {
    await prisma.attendanceSchedule.createMany({
      data: schedules.map((s) => ({ ...s, studentId })),
    });
  }

  revalidatePath("/attendance/schedule");
  revalidatePath(`/students/${studentId}`);
}

// 외출 시각 기록 (실제 외출 시작 / 복귀)
export async function saveOutingRecord(data: {
  studentId: string;
  date: string;
  outStart?: string;
  outEnd?: string;
}) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  function toDateTime(dateStr: string, timeStr?: string) {
    if (!timeStr) return undefined;
    return new Date(`${dateStr}T${timeStr}:00`);
  }

  const outStartDt = toDateTime(data.date, data.outStart);
  const outEndDt = toDateTime(data.date, data.outEnd);

  await prisma.attendanceRecord.upsert({
    where: { studentId_date: { studentId: data.studentId, date: new Date(data.date) } },
    create: {
      studentId: data.studentId,
      date: new Date(data.date),
      type: "NORMAL",
      outStart: outStartDt ?? null,
      outEnd: outEndDt ?? null,
    },
    update: {
      outStart: outStartDt !== undefined ? outStartDt : undefined,
      outEnd: outEndDt !== undefined ? outEndDt : undefined,
    },
  });

  revalidatePath("/attendance");
  revalidatePath(`/students/${data.studentId}`);
}

// 외출 일정 저장 (주간 반복)
export async function saveOutingSchedules(
  studentId: string,
  outings: { dayOfWeek: number; outStart: string; outEnd: string; reason?: string }[]
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.outingSchedule.deleteMany({ where: { studentId } });
  if (outings.length > 0) {
    await prisma.outingSchedule.createMany({
      data: outings.map((o) => ({ ...o, studentId })),
    });
  }

  revalidatePath("/attendance");
  revalidatePath(`/students/${studentId}`);
}

// ── DailyOuting (복수 외출 기록) ──

function toDateTimeLocal(dateStr: string, timeStr?: string) {
  if (!timeStr) return null;
  return new Date(`${dateStr}T${timeStr}:00`);
}

export async function createDailyOuting(data: {
  studentId: string;
  date: string;
  outStart?: string;
  outEnd?: string;
  reason?: string;
}) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const record = await prisma.dailyOuting.create({
    data: {
      studentId: data.studentId,
      date: new Date(data.date),
      outStart: toDateTimeLocal(data.date, data.outStart) ?? null,
      outEnd: toDateTimeLocal(data.date, data.outEnd) ?? null,
      reason: data.reason ?? null,
    },
  });

  revalidatePath("/attendance");
  return record;
}

export async function updateDailyOuting(id: string, data: {
  date: string;
  outStart?: string;
  outEnd?: string;
  reason?: string;
}) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.dailyOuting.update({
    where: { id },
    data: {
      outStart: data.outStart ? toDateTimeLocal(data.date, data.outStart) : null,
      outEnd: data.outEnd ? toDateTimeLocal(data.date, data.outEnd) : null,
      reason: data.reason ?? null,
    },
  });

  revalidatePath("/attendance");
}

export async function deleteDailyOuting(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.dailyOuting.delete({ where: { id } });
  revalidatePath("/attendance");
}
