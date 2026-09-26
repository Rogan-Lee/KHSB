"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireAnyStaff, requireStaff } from "@/lib/roles";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AttendanceType } from "@/generated/prisma";
import { todayKST } from "@/lib/utils";
import {
  queueParentAttendancePush,
  queueParentAttendanceTransitionPush,
} from "@/lib/mobile-push";

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

async function requireStaffSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);
  return session;
}

type ScheduleInput = { dayOfWeek: number; startTime: string; endTime: string };
type OutingScheduleInput = { dayOfWeek: number; outStart: string; outEnd: string; reason?: string };

const MAX_SCHEDULE_ROWS = 100;

function assertDayOfWeek(v: unknown): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 6) {
    throw new Error("요일 값이 올바르지 않습니다");
  }
  return v;
}

function scheduleTime(v: unknown): string {
  if (typeof v !== "string") throw new Error("시간 형식이 올바르지 않습니다");
  return v.slice(0, 10);
}

// 클라이언트 객체를 그대로 spread 하지 않고 허용 필드만 남긴다 (id 등 임의 컬럼 주입 방지)
function sanitizeSchedules(studentId: string, schedules: ScheduleInput[]) {
  if (!Array.isArray(schedules) || schedules.length > MAX_SCHEDULE_ROWS) {
    throw new Error("입실 일정 형식이 올바르지 않습니다");
  }
  return schedules.map((s) => ({
    studentId,
    dayOfWeek: assertDayOfWeek(s?.dayOfWeek),
    startTime: scheduleTime(s?.startTime),
    endTime: scheduleTime(s?.endTime),
  }));
}

function sanitizeOutingSchedules(studentId: string, outings: OutingScheduleInput[]) {
  if (!Array.isArray(outings) || outings.length > MAX_SCHEDULE_ROWS) {
    throw new Error("외출 일정 형식이 올바르지 않습니다");
  }
  return outings.map((o) => ({
    studentId,
    dayOfWeek: assertDayOfWeek(o?.dayOfWeek),
    outStart: scheduleTime(o?.outStart),
    outEnd: scheduleTime(o?.outEnd),
    ...(typeof o?.reason === "string" ? { reason: o.reason.slice(0, 200) } : {}),
  }));
}

export async function upsertAttendance(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);

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
  await requireStaffSession();
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
  await requireStaffSession();
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
  requireAnyStaff(session.user.role);

  function toDateTime(dateStr: string, timeStr?: string) {
    if (!timeStr) return null;
    return new Date(`${dateStr}T${timeStr}:00+09:00`);
  }

  const targetDate = data.date;

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
      // 학부모 앱 퇴실 알림 (fire-and-forget)
      queueParentAttendanceTransitionPush(data.studentId, yesterdayRecord, {
        checkIn: yesterdayRecord.checkIn,
        checkOut: toDateTime(yesterdayStr, data.checkOut),
      });
      revalidatePath("/attendance");
      revalidatePath(`/students/${data.studentId}`);
      return;
    }
  }

  // 학부모 앱 입실/퇴실 알림용 — 저장 전 상태 (새로 생긴 입실·퇴실만 알린다)
  const before = await prisma.attendanceRecord.findUnique({
    where: { studentId_date: { studentId: data.studentId, date: new Date(targetDate) } },
    select: { checkIn: true, checkOut: true },
  });

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

  queueParentAttendanceTransitionPush(data.studentId, before, {
    checkIn: toDateTime(targetDate, data.checkIn),
    checkOut: toDateTime(targetDate, data.checkOut),
  });

  revalidatePath("/attendance");
  revalidatePath(`/students/${data.studentId}`);
}

/**
 * 입실 요일 수 → 반 자동 분류
 * - 0회: null (미배정)
 * - 1~3회: 선택반
 * - 4회 이상: 정규반
 */
function deriveClassGroup(dayCount: number): string | null {
  if (dayCount === 0) return null;
  if (dayCount >= 4) return "정규반";
  return "선택반";
}

export async function saveAttendanceSchedule(
  studentId: string,
  schedules: { dayOfWeek: number; startTime: string; endTime: string }[]
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);

  const scheduleRows = sanitizeSchedules(studentId, schedules);

  await prisma.attendanceSchedule.deleteMany({ where: { studentId } });
  if (scheduleRows.length > 0) {
    await prisma.attendanceSchedule.createMany({
      data: scheduleRows,
    });
  }

  // 입실 요일 수에 따라 정규반/선택반 자동 분류
  const dayCount = new Set(scheduleRows.map((s) => s.dayOfWeek)).size;
  await prisma.student.update({
    where: { id: studentId },
    data: { classGroup: deriveClassGroup(dayCount) },
  });

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
  requireAnyStaff(session.user.role);

  function toDateTime(dateStr: string, timeStr?: string) {
    if (!timeStr) return undefined;
    return new Date(`${dateStr}T${timeStr}:00+09:00`);
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

// 입퇴실 일정 + 외출 일정 원자적 저장 (트랜잭션)
export async function saveScheduleAndOutings(
  studentId: string,
  schedules: { dayOfWeek: number; startTime: string; endTime: string }[],
  outings: { dayOfWeek: number; outStart: string; outEnd: string; reason?: string }[]
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);

  const scheduleRows = sanitizeSchedules(studentId, schedules);
  const outingRows = sanitizeOutingSchedules(studentId, outings);

  // 입실 요일 수에 따라 정규반/선택반 자동 분류
  const dayCount = new Set(scheduleRows.map((s) => s.dayOfWeek)).size;

  await prisma.$transaction([
    prisma.attendanceSchedule.deleteMany({ where: { studentId } }),
    ...(scheduleRows.length > 0
      ? [prisma.attendanceSchedule.createMany({ data: scheduleRows })]
      : []),
    prisma.outingSchedule.deleteMany({ where: { studentId } }),
    ...(outingRows.length > 0
      ? [prisma.outingSchedule.createMany({ data: outingRows })]
      : []),
    prisma.student.update({
      where: { id: studentId },
      data: { classGroup: deriveClassGroup(dayCount) },
    }),
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
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);

  const outingRows = sanitizeOutingSchedules(studentId, outings);

  await prisma.outingSchedule.deleteMany({ where: { studentId } });
  if (outingRows.length > 0) {
    await prisma.outingSchedule.createMany({
      data: outingRows,
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
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);

  const record = await prisma.dailyOuting.create({
    data: {
      studentId: data.studentId,
      date: new Date(data.date),
      outStart: toDateTimeLocal(data.date, data.outStart) ?? null,
      outEnd: toDateTimeLocal(data.date, data.outEnd) ?? null,
      reason: data.reason ?? null,
    },
  });
  // 학부모 앱 외출 알림 (진행 중 외출이 새로 시작된 경우만)
  if (record.outStart && !record.outEnd) {
    queueParentAttendancePush(record.studentId, "OUTING", record.outStart);
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
  requireAnyStaff(session.user.role);

  const before = await prisma.dailyOuting.findUnique({
    where: { id },
    select: { studentId: true, outEnd: true },
  });

  const updated = await prisma.dailyOuting.update({
    where: { id },
    data: {
      outStart: data.outStart ? toDateTimeLocal(data.date, data.outStart) : null,
      outEnd: data.outEnd ? toDateTimeLocal(data.date, data.outEnd) : null,
      reason: data.reason ?? null,
    },
  });
  // 학부모 앱 복귀 알림 (외출 중 → 복귀 시각이 새로 기록된 경우만)
  if (before && !before.outEnd && updated.outEnd) {
    queueParentAttendancePush(updated.studentId, "RETURN", updated.outEnd);
  }

  revalidatePath("/attendance");
}

export async function deleteDailyOuting(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);

  await prisma.dailyOuting.delete({ where: { id } });
  revalidatePath("/attendance");
}

// ── N차 외출 (Sprint 2 PR 2.1) ──────────────────────────────────────────
// sequence 기반 다중 외출. sequence=1 인 경우 AttendanceRecord.outStart/outEnd
// 에도 동일 값을 미러링 — 레거시 캐시 호환 유지.
//
// 시간 입력은 "HH:mm" 문자열, date 는 Date 객체. 모두 KST 기준으로 저장.

function combineKST(date: Date, hhmm: string | null | undefined): Date | null {
  if (!hhmm) return null;
  // date 는 자정 기준 Date. ISO 의 날짜 부분만 사용.
  const dateStr = date.toISOString().split("T")[0];
  return new Date(`${dateStr}T${hhmm}:00+09:00`);
}

async function mirrorSequenceOneToAttendance(
  studentId: string,
  date: Date,
  outStart: Date | null,
  outEnd: Date | null
) {
  await prisma.attendanceRecord.upsert({
    where: { studentId_date: { studentId, date } },
    create: {
      studentId,
      date,
      type: "NORMAL",
      outStart,
      outEnd,
    },
    update: {
      outStart,
      outEnd,
    },
  });
}

export async function addOuting(
  studentId: string,
  date: Date,
  data: { outStart: string; outEnd: string | null; reason?: string }
) {
  const session = await auth();
  requireStaff(session?.user?.role);
  if (!session?.user) throw new Error("Unauthorized");

  // 같은 (studentId, date) 의 최대 sequence + 1
  const agg = await prisma.dailyOuting.aggregate({
    where: { studentId, date },
    _max: { sequence: true },
  });
  const nextSequence = (agg._max.sequence ?? 0) + 1;

  const outStartDt = combineKST(date, data.outStart);
  const outEndDt = combineKST(date, data.outEnd);

  const created = await prisma.dailyOuting.create({
    data: {
      studentId,
      date,
      sequence: nextSequence,
      isPlaceholder: false,
      outStart: outStartDt,
      outEnd: outEndDt,
      reason: data.reason ?? null,
    },
  });

  if (nextSequence === 1) {
    await mirrorSequenceOneToAttendance(studentId, date, outStartDt, outEndDt);
  }

  revalidatePath("/attendance");
  revalidatePath(`/students/${studentId}`);
  return created;
}

export async function updateOuting(
  id: string,
  patch: { outStart?: string; outEnd?: string | null; reason?: string }
) {
  const session = await auth();
  requireStaff(session?.user?.role);
  if (!session?.user) throw new Error("Unauthorized");

  const existing = await prisma.dailyOuting.findUnique({ where: { id } });
  if (!existing) throw new Error("외출 기록을 찾을 수 없습니다");

  const nextOutStart =
    patch.outStart !== undefined
      ? combineKST(existing.date, patch.outStart)
      : existing.outStart;
  const nextOutEnd =
    patch.outEnd !== undefined
      ? combineKST(existing.date, patch.outEnd)
      : existing.outEnd;
  const nextReason = patch.reason !== undefined ? patch.reason : existing.reason;

  const updated = await prisma.dailyOuting.update({
    where: { id },
    data: {
      outStart: nextOutStart,
      outEnd: nextOutEnd,
      reason: nextReason,
    },
  });

  if (existing.sequence === 1) {
    await mirrorSequenceOneToAttendance(
      existing.studentId,
      existing.date,
      nextOutStart,
      nextOutEnd
    );
  }

  revalidatePath("/attendance");
  revalidatePath(`/students/${existing.studentId}`);
  return updated;
}

export async function deleteOuting(id: string) {
  const session = await auth();
  requireStaff(session?.user?.role);
  if (!session?.user) throw new Error("Unauthorized");

  const existing = await prisma.dailyOuting.findUnique({ where: { id } });
  if (!existing) return; // already gone, idempotent

  await prisma.dailyOuting.delete({ where: { id } });

  // sequence==1 삭제 시 레거시 캐시도 비움 (sequence 2 → 1 승격은 명시적 X)
  if (existing.sequence === 1) {
    await prisma.attendanceRecord.updateMany({
      where: { studentId: existing.studentId, date: existing.date },
      data: { outStart: null, outEnd: null },
    });
  }

  revalidatePath("/attendance");
  revalidatePath(`/students/${existing.studentId}`);
}

export type OutingForDate = {
  id: string;
  sequence: number;
  outStart: Date | null;
  outEnd: Date | null;
  reason: string | null;
  isPlaceholder: boolean;
};

export async function getOutingsForDate(
  date: Date
): Promise<Record<string, OutingForDate[]>> {
  await requireStaffSession();
  const rows = await prisma.dailyOuting.findMany({
    where: { date },
    orderBy: [{ studentId: "asc" }, { sequence: "asc" }],
    select: {
      id: true,
      studentId: true,
      sequence: true,
      outStart: true,
      outEnd: true,
      reason: true,
      isPlaceholder: true,
    },
  });

  const byStudent: Record<string, OutingForDate[]> = {};
  for (const r of rows) {
    if (!byStudent[r.studentId]) byStudent[r.studentId] = [];
    byStudent[r.studentId].push({
      id: r.id,
      sequence: r.sequence,
      outStart: r.outStart,
      outEnd: r.outEnd,
      reason: r.reason,
      isPlaceholder: r.isPlaceholder,
    });
  }
  return byStudent;
}
