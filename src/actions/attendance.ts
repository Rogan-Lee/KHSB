"use server";

import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { requireOrg } from "@/lib/org";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AttendanceType } from "@/generated/prisma";
import { todayKST } from "@/lib/utils";

async function getSession() {
  const org = await requireOrg();
  const user = await getUser();
  if (!user) throw new Error("인증 필요");
  return { ...user, orgId: org.orgId };
}

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
  return new Date(`${dateStr}T${timeStr}:00+09:00`);
}

export async function upsertAttendance(formData: FormData) {
  const session = await getSession();

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
      orgId: session.orgId,
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
  const session = await getSession();
  const today = todayKST();
  const kstNow = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  const dayOfWeek = kstNow.getUTCDay();

  const students = await prisma.student.findMany({
    where: { orgId: session.orgId, status: "ACTIVE" },
    include: {
      attendances: {
        where: { date: today },
      },
      schedules: {
        where: { dayOfWeek },
      },
    },
    orderBy: { name: "asc" },
  });

  return students;
}

export async function getAttendanceByDate(date: Date) {
  const session = await getSession();
  return prisma.attendanceRecord.findMany({
    where: { orgId: session.orgId, date },
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
  const session = await getSession();

  function toDateTime(dateStr: string, timeStr?: string) {
    if (!timeStr) return null;
    return new Date(`${dateStr}T${timeStr}:00+09:00`);
  }

  let targetDate = data.date;

  // 자정 이후 퇴실 처리: 오늘 checkIn이 없고, 퇴실만 입력 중이면
  // 어제 레코드에 퇴실을 기록
  if (data.checkOut && !data.checkIn) {
    const today = new Date(data.date);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const yesterdayRecord = await prisma.attendanceRecord.findUnique({
      where: {
        studentId_date: { studentId: data.studentId, date: yesterday },
      },
      select: { checkIn: true, checkOut: true },
    });

    // 어제 입실은 있고 퇴실이 없으면 → 어제 레코드에 퇴실 기록
    if (yesterdayRecord?.checkIn && !yesterdayRecord.checkOut) {
      const yesterdayStr = yesterday.toISOString().split("T")[0];
      await prisma.attendanceRecord.update({
        where: {
          studentId_date: { studentId: data.studentId, date: yesterday },
        },
        data: {
          checkOut: toDateTime(yesterdayStr, data.checkOut),
        },
      });
      revalidatePath("/attendance");
      revalidatePath(`/students/${data.studentId}`);
      return;
    }
  }

  await prisma.attendanceRecord.upsert({
    where: {
      studentId_date: {
        studentId: data.studentId,
        date: new Date(targetDate),
      },
    },
    create: {
      orgId: session.orgId,
      studentId: data.studentId,
      date: new Date(targetDate),
      checkIn: toDateTime(targetDate, data.checkIn),
      checkOut: toDateTime(targetDate, data.checkOut),
      type: data.type,
      notes: data.notes || null,
    },
    update: {
      checkIn: toDateTime(targetDate, data.checkIn),
      checkOut: toDateTime(targetDate, data.checkOut),
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
  const session = await getSession();

  await prisma.attendanceSchedule.deleteMany({ where: { studentId, orgId: session.orgId } });
  if (schedules.length > 0) {
    await prisma.attendanceSchedule.createMany({
      data: schedules.map((s) => ({ ...s, studentId, orgId: session.orgId })),
    });
  }

  revalidatePath("/attendance/schedule");
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/students");
}

// 외출 시각 기록 (실제 외출 시작 / 복귀)
export async function saveOutingRecord(data: {
  studentId: string;
  date: string;
  outStart?: string;
  outEnd?: string;
}) {
  const session = await getSession();

  function toDateTime(dateStr: string, timeStr?: string) {
    if (!timeStr) return undefined;
    return new Date(`${dateStr}T${timeStr}:00+09:00`);
  }

  const outStartDt = toDateTime(data.date, data.outStart);
  const outEndDt = toDateTime(data.date, data.outEnd);

  await prisma.attendanceRecord.upsert({
    where: { studentId_date: { studentId: data.studentId, date: new Date(data.date) } },
    create: {
      orgId: session.orgId,
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

// 입퇴실 일정 + 외출 일정 원자적 저장 (트랜잭션)
export async function saveScheduleAndOutings(
  studentId: string,
  schedules: { dayOfWeek: number; startTime: string; endTime: string }[],
  outings: { dayOfWeek: number; outStart: string; outEnd: string; reason?: string }[]
) {
  const session = await getSession();

  await prisma.$transaction([
    prisma.attendanceSchedule.deleteMany({ where: { studentId, orgId: session.orgId } }),
    ...(schedules.length > 0
      ? [prisma.attendanceSchedule.createMany({ data: schedules.map((s) => ({ ...s, studentId, orgId: session.orgId })) })]
      : []),
    prisma.outingSchedule.deleteMany({ where: { studentId, orgId: session.orgId } }),
    ...(outings.length > 0
      ? [prisma.outingSchedule.createMany({ data: outings.map((o) => ({ ...o, studentId, orgId: session.orgId })) })]
      : []),
  ]);

  revalidatePath("/attendance/schedule");
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/students");
}

// 외출 일정 저장 (주간 반복)
export async function saveOutingSchedules(
  studentId: string,
  outings: { dayOfWeek: number; outStart: string; outEnd: string; reason?: string }[]
) {
  const session = await getSession();

  await prisma.outingSchedule.deleteMany({ where: { studentId, orgId: session.orgId } });
  if (outings.length > 0) {
    await prisma.outingSchedule.createMany({
      data: outings.map((o) => ({ ...o, studentId, orgId: session.orgId })),
    });
  }

  revalidatePath("/attendance");
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/students");
}

// ── DailyOuting (복수 외출 기록) ──

function toDateTimeLocal(dateStr: string, timeStr?: string) {
  if (!timeStr) return null;
  return new Date(`${dateStr}T${timeStr}:00+09:00`);
}

export async function createDailyOuting(data: {
  studentId: string;
  date: string;
  outStart?: string;
  outEnd?: string;
  reason?: string;
}) {
  const session = await getSession();

  const record = await prisma.dailyOuting.create({
    data: {
      orgId: session.orgId,
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
  const session = await getSession();

  await prisma.dailyOuting.update({
    where: { id, orgId: session.orgId },
    data: {
      outStart: data.outStart ? toDateTimeLocal(data.date, data.outStart) : null,
      outEnd: data.outEnd ? toDateTimeLocal(data.date, data.outEnd) : null,
      reason: data.reason ?? null,
    },
  });

  revalidatePath("/attendance");
}

export async function deleteDailyOuting(id: string) {
  const session = await getSession();

  await prisma.dailyOuting.delete({ where: { id, orgId: session.orgId } });
  revalidatePath("/attendance");
}
