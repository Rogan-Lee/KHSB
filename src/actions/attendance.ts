"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AttendanceType } from "@/generated/prisma";
import { todayKST } from "@/lib/utils";

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
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const raw = Object.fromEntries(formData.entries());
  const data = recordSchema.parse(raw);

  try {
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
  } catch (error) {
    console.error("[upsertAttendance] 실패", { userId: session.user.id, studentId: data.studentId, date: data.date, error });
    throw new Error("출결 기록에 실패했습니다. 다시 시도해주세요.");
  }

  revalidatePath("/attendance");
  revalidatePath(`/students/${data.studentId}`);
}

export async function getTodayAttendance() {
  const today = todayKST();
  const kstNow = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  const dayOfWeek = kstNow.getUTCDay();

  const students = await prisma.student.findMany({
    where: { status: "ACTIVE" },
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
      try {
        await prisma.attendanceRecord.update({
          where: {
            studentId_date: { studentId: data.studentId, date: yesterday },
          },
          data: {
            checkOut: toDateTime(yesterdayStr, data.checkOut),
          },
        });
      } catch (error) {
        console.error("[saveAttendanceRecord] 어제 퇴실 기록 실패", { userId: session.user.id, studentId: data.studentId, error });
        throw new Error("출결 기록에 실패했습니다. 다시 시도해주세요.");
      }
      revalidatePath("/attendance");
      revalidatePath(`/students/${data.studentId}`);
      return;
    }
  }

  try {
    await prisma.attendanceRecord.upsert({
      where: {
        studentId_date: {
          studentId: data.studentId,
          date: new Date(targetDate),
        },
      },
      create: {
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
  } catch (error) {
    console.error("[saveAttendanceRecord] 실패", { userId: session.user.id, studentId: data.studentId, date: targetDate, error });
    throw new Error("출결 기록에 실패했습니다. 다시 시도해주세요.");
  }

  revalidatePath("/attendance");
  revalidatePath(`/students/${data.studentId}`);
}

export async function saveAttendanceSchedule(
  studentId: string,
  schedules: { dayOfWeek: number; startTime: string; endTime: string }[]
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  try {
    await prisma.attendanceSchedule.deleteMany({ where: { studentId } });
    if (schedules.length > 0) {
      await prisma.attendanceSchedule.createMany({
        data: schedules.map((s) => ({ ...s, studentId })),
      });
    }
  } catch (error) {
    console.error("[saveAttendanceSchedule] 실패", { userId: session.user.id, studentId, error });
    throw new Error("출결 일정 저장에 실패했습니다. 다시 시도해주세요.");
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
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  function toDateTime(dateStr: string, timeStr?: string) {
    if (!timeStr) return undefined;
    return new Date(`${dateStr}T${timeStr}:00+09:00`);
  }

  const outStartDt = toDateTime(data.date, data.outStart);
  const outEndDt = toDateTime(data.date, data.outEnd);

  try {
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
  } catch (error) {
    console.error("[saveOutingRecord] 실패", { userId: session.user.id, studentId: data.studentId, date: data.date, error });
    throw new Error("외출 기록에 실패했습니다. 다시 시도해주세요.");
  }

  revalidatePath("/attendance");
  revalidatePath(`/students/${data.studentId}`);
}

// 입퇴실 일정 + 외출 일정 원자적 저장 (트랜잭션)
export async function saveScheduleAndOutings(
  studentId: string,
  schedules: { dayOfWeek: number; startTime: string; endTime: string }[],
  outings: { dayOfWeek: number; outStart: string; outEnd: string; reason?: string }[]
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  try {
    await prisma.$transaction([
      prisma.attendanceSchedule.deleteMany({ where: { studentId } }),
      ...(schedules.length > 0
        ? [prisma.attendanceSchedule.createMany({ data: schedules.map((s) => ({ ...s, studentId })) })]
        : []),
      prisma.outingSchedule.deleteMany({ where: { studentId } }),
      ...(outings.length > 0
        ? [prisma.outingSchedule.createMany({ data: outings.map((o) => ({ ...o, studentId })) })]
        : []),
    ]);
  } catch (error) {
    console.error("[saveScheduleAndOutings] 실패", { userId: session.user.id, studentId, error });
    throw new Error("일정 저장에 실패했습니다. 다시 시도해주세요.");
  }

  revalidatePath("/attendance/schedule");
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/students");
}

// 외출 일정 저장 (주간 반복)
export async function saveOutingSchedules(
  studentId: string,
  outings: { dayOfWeek: number; outStart: string; outEnd: string; reason?: string }[]
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  try {
    await prisma.outingSchedule.deleteMany({ where: { studentId } });
    if (outings.length > 0) {
      await prisma.outingSchedule.createMany({
        data: outings.map((o) => ({ ...o, studentId })),
      });
    }
  } catch (error) {
    console.error("[saveOutingSchedules] 실패", { userId: session.user.id, studentId, error });
    throw new Error("외출 일정 저장에 실패했습니다. 다시 시도해주세요.");
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
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  let record;
  try {
    record = await prisma.dailyOuting.create({
      data: {
        studentId: data.studentId,
        date: new Date(data.date),
        outStart: toDateTimeLocal(data.date, data.outStart) ?? null,
        outEnd: toDateTimeLocal(data.date, data.outEnd) ?? null,
        reason: data.reason ?? null,
      },
    });
  } catch (error) {
    console.error("[createDailyOuting] 실패", { userId: session.user.id, studentId: data.studentId, error });
    throw new Error("외출 기록에 실패했습니다. 다시 시도해주세요.");
  }

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

  try {
    await prisma.dailyOuting.update({
      where: { id },
      data: {
        outStart: data.outStart ? toDateTimeLocal(data.date, data.outStart) : null,
        outEnd: data.outEnd ? toDateTimeLocal(data.date, data.outEnd) : null,
        reason: data.reason ?? null,
      },
    });
  } catch (error) {
    console.error("[updateDailyOuting] 실패", { userId: session.user.id, outingId: id, error });
    throw new Error("외출 기록 수정에 실패했습니다. 다시 시도해주세요.");
  }

  revalidatePath("/attendance");
}

export async function deleteDailyOuting(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  try {
    await prisma.dailyOuting.delete({ where: { id } });
  } catch (error) {
    console.error("[deleteDailyOuting] 실패", { userId: session.user.id, outingId: id, error });
    throw new Error("외출 기록 삭제에 실패했습니다. 다시 시도해주세요.");
  }

  revalidatePath("/attendance");
}
