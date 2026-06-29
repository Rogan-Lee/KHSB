import { z } from "zod";

import type { PatrolStatus } from "@/generated/prisma";
import { MobileApiError } from "@/lib/mobile-auth";
import { getKstDayContext } from "@/lib/mobile-data";
import { calculatePayrollFromEntries } from "@/lib/payroll";
import { prisma } from "@/lib/prisma";

const clockSchema = z.object({
  action: z.enum(["CLOCK_IN", "CLOCK_OUT"]),
  note: z.string().trim().max(500).optional().nullable(),
});

const handoverSchema = z.object({
  category: z.string().trim().max(40).optional().nullable(),
  content: z.string().trim().min(1, "인수인계 내용을 입력하세요").max(8000),
  priority: z.enum(["URGENT", "NORMAL"]).default("NORMAL"),
});

const handoverItemSchema = z.object({
  kind: z.enum(["TASK", "CHECKLIST"]),
});

const patrolActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("START"),
    label: z.string().trim().max(80).optional().nullable(),
  }),
  z.object({
    action: z.literal("END"),
    roundId: z.string().min(1),
  }),
]);

const patrolRecordSchema = z.object({
  note: z.string().trim().max(1000).optional().nullable(),
  status: z.enum(["OK", "NOTE", "ABSENT"]),
  studentId: z.string().min(1),
});

function parseBody<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new MobileApiError(
    result.error.issues[0]?.message ?? "입력값을 확인하세요",
    400,
  );
}

function serializeTag(tag: {
  id: string;
  note: string | null;
  taggedAt: Date;
  type: "CLOCK_IN" | "CLOCK_OUT";
}) {
  return {
    id: tag.id,
    note: tag.note,
    taggedAt: tag.taggedAt.toISOString(),
    type: tag.type,
  };
}

function monthRange(year: number, month: number) {
  return {
    gte: new Date(Date.UTC(year, month - 1, 1)),
    lt: new Date(Date.UTC(year, month, 1)),
  };
}

export async function getMobileStaffOperations(
  userId: string,
  now = new Date(),
) {
  const context = getKstDayContext(now);
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = kstNow.getUTCFullYear();
  const month = kstNow.getUTCMonth() + 1;
  const range = monthRange(year, month);
  const since = new Date(context.date);
  since.setUTCDate(since.getUTCDate() - 13);

  const [
    lastTag,
    recentTags,
    entries,
    workMonth,
    contract,
    unreadHandovers,
    todayHandovers,
    activeRound,
    rosterCount,
  ] = await Promise.all([
    prisma.workTag.findFirst({
      where: { userId },
      orderBy: { taggedAt: "desc" },
      select: { id: true, note: true, taggedAt: true, type: true },
    }),
    prisma.workTag.findMany({
      where: { userId },
      orderBy: { taggedAt: "desc" },
      take: 10,
      select: { id: true, note: true, taggedAt: true, type: true },
    }),
    prisma.workHourEntry.findMany({
      where: { userId, workDate: range },
      orderBy: { workDate: "asc" },
      select: { minutes: true, workDate: true },
    }),
    prisma.workMonth.findUnique({
      where: { userId_year_month: { month, userId, year } },
      select: {
        extraMinutes: true,
        ownerConfirmedAt: true,
        staffConfirmedAt: true,
      },
    }),
    prisma.payrollContract.findFirst({
      where: {
        userId,
        effectiveFrom: { lte: range.gte },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: range.gte } }],
      },
      orderBy: { effectiveFrom: "desc" },
      select: {
        hourlyRate: true,
        monthlySalary: true,
        weeklyHolidayPay: true,
      },
    }),
    prisma.handover.count({
      where: {
        date: { gte: since },
        reads: { none: { userId } },
      },
    }),
    prisma.handover.count({ where: { date: context.date } }),
    prisma.patrolRound.findFirst({
      where: { endedAt: null },
      orderBy: { startedAt: "desc" },
      select: {
        _count: { select: { records: true } },
        id: true,
        label: true,
        startedAt: true,
      },
    }),
    prisma.attendanceRecord.count({
      where: { checkIn: { not: null }, date: context.date },
    }),
  ]);

  const pay = calculatePayrollFromEntries(
    entries.map((entry) => ({
      date: entry.workDate,
      minutes: entry.minutes,
    })),
    workMonth?.extraMinutes ?? 0,
    contract?.hourlyRate ?? 0,
    contract?.weeklyHolidayPay ?? false,
    contract?.monthlySalary,
  );

  return {
    clock: {
      isWorking: lastTag?.type === "CLOCK_IN",
      lastTag: lastTag ? serializeTag(lastTag) : null,
      recentTags: recentTags.map(serializeTag),
    },
    handovers: {
      today: todayHandovers,
      unread: unreadHandovers,
    },
    month: {
      month,
      ownerConfirmedAt: workMonth?.ownerConfirmedAt?.toISOString() ?? null,
      staffConfirmedAt: workMonth?.staffConfirmedAt?.toISOString() ?? null,
      totalMinutes: pay.totalMinutes,
      totalWage: pay.totalWage,
      year,
    },
    patrol: activeRound
      ? {
          checkedCount: activeRound._count.records,
          id: activeRound.id,
          label: activeRound.label,
          rosterCount,
          startedAt: activeRound.startedAt.toISOString(),
        }
      : null,
  };
}

export async function updateMobileClock(
  userId: string,
  input: unknown,
  now = new Date(),
) {
  const data = parseBody(clockSchema, input);
  const last = await prisma.workTag.findFirst({
    where: { userId },
    orderBy: { taggedAt: "desc" },
    select: { type: true },
  });

  if (data.action === "CLOCK_IN" && last?.type === "CLOCK_IN") {
    throw new MobileApiError("이미 출근 상태입니다", 409);
  }
  if (data.action === "CLOCK_OUT" && last?.type !== "CLOCK_IN") {
    throw new MobileApiError("출근 처리 후 퇴근할 수 있습니다", 409);
  }

  const tag = await prisma.workTag.create({
    data: {
      note: data.note || null,
      taggedAt: now,
      type: data.action,
      userId,
    },
    select: { id: true, note: true, taggedAt: true, type: true },
  });
  return serializeTag(tag);
}

function serializeHandover(
  handover: {
    authorId: string;
    authorName: string;
    category: string | null;
    checklist: {
      id: string;
      isChecked: boolean;
      title: string;
    }[];
    content: string;
    createdAt: Date;
    date: Date;
    id: string;
    isPinned: boolean;
    priority: "URGENT" | "NORMAL";
    reads: { readAt: Date; userId: string; userName: string }[];
    recipientName: string | null;
    tasks: {
      assigneeName: string | null;
      id: string;
      isCompleted: boolean;
      title: string;
    }[];
  },
  userId: string,
) {
  return {
    authorId: handover.authorId,
    authorName: handover.authorName,
    category: handover.category,
    checklist: handover.checklist,
    content: handover.content,
    createdAt: handover.createdAt.toISOString(),
    date: handover.date.toISOString().slice(0, 10),
    id: handover.id,
    isPinned: handover.isPinned,
    isRead: handover.reads.some((read) => read.userId === userId),
    priority: handover.priority,
    readCount: handover.reads.length,
    recipientName: handover.recipientName,
    tasks: handover.tasks,
  };
}

const handoverInclude = {
  checklist: {
    orderBy: { order: "asc" as const },
    select: { id: true, isChecked: true, title: true },
  },
  reads: {
    select: { readAt: true, userId: true, userName: true },
  },
  tasks: {
    orderBy: { order: "asc" as const },
    select: {
      assigneeName: true,
      id: true,
      isCompleted: true,
      title: true,
    },
  },
};

export async function getMobileHandovers(userId: string, now = new Date()) {
  const context = getKstDayContext(now);
  const since = new Date(context.date);
  since.setUTCDate(since.getUTCDate() - 13);
  const handovers = await prisma.handover.findMany({
    where: { date: { gte: since } },
    include: handoverInclude,
    orderBy: [
      { date: "desc" },
      { isPinned: "desc" },
      { createdAt: "desc" },
    ],
    take: 100,
  });
  return { items: handovers.map((item) => serializeHandover(item, userId)) };
}

export async function createMobileHandover(
  user: { id: string; name: string },
  input: unknown,
  now = new Date(),
) {
  const data = parseBody(handoverSchema, input);
  const handover = await prisma.handover.create({
    data: {
      authorId: user.id,
      authorName: user.name || "알 수 없음",
      category: data.category || null,
      content: data.content,
      date: getKstDayContext(now).date,
      priority: data.priority,
    },
    include: handoverInclude,
  });
  return serializeHandover(handover, user.id);
}

export async function markMobileHandoverRead(
  user: { id: string; name: string },
  handoverId: string,
) {
  const exists = await prisma.handover.findUnique({
    where: { id: handoverId },
    select: { id: true },
  });
  if (!exists) throw new MobileApiError("인수인계를 찾을 수 없습니다", 404);

  await prisma.handoverRead.upsert({
    where: { handoverId_userId: { handoverId, userId: user.id } },
    create: {
      handoverId,
      userId: user.id,
      userName: user.name || "알 수 없음",
    },
    update: { readAt: new Date() },
  });
  return { ok: true };
}

export async function toggleMobileHandoverItem(
  user: { id: string; name: string },
  itemId: string,
  input: unknown,
) {
  const { kind } = parseBody(handoverItemSchema, input);
  if (kind === "TASK") {
    const task = await prisma.handoverTask.findUnique({
      where: { id: itemId },
      select: { isCompleted: true },
    });
    if (!task) throw new MobileApiError("할 일을 찾을 수 없습니다", 404);
    await prisma.handoverTask.update({
      where: { id: itemId },
      data: {
        completedAt: task.isCompleted ? null : new Date(),
        isCompleted: !task.isCompleted,
      },
    });
    return { ok: true };
  }

  const item = await prisma.handoverChecklist.findUnique({
    where: { id: itemId },
    select: { isChecked: true },
  });
  if (!item) throw new MobileApiError("체크리스트를 찾을 수 없습니다", 404);
  await prisma.handoverChecklist.update({
    where: { id: itemId },
    data: {
      checkedAt: item.isChecked ? null : new Date(),
      checkedById: item.isChecked ? null : user.id,
      checkedByName: item.isChecked ? null : user.name || "알 수 없음",
      isChecked: !item.isChecked,
    },
  });
  return { ok: true };
}

type PatrolRecordRow = {
  checkedAt: Date;
  id: string;
  note: string | null;
  status: PatrolStatus;
  student: { name: string; seat: string | null };
  studentId: string;
};

function serializePatrolRecord(record: PatrolRecordRow) {
  return {
    checkedAt: record.checkedAt.toISOString(),
    id: record.id,
    note: record.note,
    seat: record.student.seat,
    status: record.status,
    studentId: record.studentId,
    studentName: record.student.name,
  };
}

export async function getMobilePatrolData(userName: string) {
  const context = getKstDayContext();
  const [attendance, allStudents, activeRound] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { checkIn: { not: null }, date: context.date },
      select: {
        student: {
          select: {
            grade: true,
            id: true,
            name: true,
            seat: true,
            status: true,
          },
        },
      },
    }),
    prisma.student.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ seat: "asc" }, { name: "asc" }],
      select: { grade: true, id: true, name: true, seat: true },
    }),
    prisma.patrolRound.findFirst({
      where: { endedAt: null },
      orderBy: { startedAt: "desc" },
      select: { id: true, label: true, startedAt: true },
    }),
  ]);

  const records = activeRound
    ? await prisma.patrolRecord.findMany({
        where: { roundId: activeRound.id },
        orderBy: { checkedAt: "desc" },
        select: {
          checkedAt: true,
          id: true,
          note: true,
          status: true,
          student: { select: { name: true, seat: true } },
          studentId: true,
        },
      })
    : [];

  const roster = attendance
    .map((item) => item.student)
    .filter((student) => student.status === "ACTIVE")
    .map((student) => ({
      grade: student.grade,
      id: student.id,
      name: student.name,
      seat: student.seat,
    }))
    .sort(
      (a, b) =>
        (a.seat ?? "").localeCompare(b.seat ?? "", "ko") ||
        a.name.localeCompare(b.name, "ko"),
    );

  return {
    activeRound: activeRound
      ? {
          id: activeRound.id,
          label: activeRound.label,
          startedAt: activeRound.startedAt.toISOString(),
        }
      : null,
    allStudents,
    patrollerName: userName,
    records: records.map(serializePatrolRecord),
    roster,
  };
}

export async function updateMobilePatrolRound(
  user: { id: string; name: string },
  input: unknown,
  now = new Date(),
) {
  const data = parseBody(patrolActionSchema, input);
  if (data.action === "END") {
    const updated = await prisma.patrolRound.updateMany({
      where: { endedAt: null, id: data.roundId },
      data: { endedAt: now },
    });
    if (updated.count === 0) {
      throw new MobileApiError("진행 중인 순찰 회차를 찾을 수 없습니다", 404);
    }
    return { ok: true };
  }

  const existing = await prisma.patrolRound.findFirst({
    where: { endedAt: null },
    orderBy: { startedAt: "desc" },
    select: { id: true, label: true, startedAt: true },
  });
  if (existing) {
    return {
      id: existing.id,
      label: existing.label,
      reused: true,
      startedAt: existing.startedAt.toISOString(),
    };
  }

  const round = await prisma.patrolRound.create({
    data: {
      label: data.label || null,
      patrollerId: user.id,
      patrollerName: user.name,
      startedAt: now,
    },
    select: { id: true, label: true, startedAt: true },
  });
  return {
    id: round.id,
    label: round.label,
    reused: false,
    startedAt: round.startedAt.toISOString(),
  };
}

export async function saveMobilePatrolRecord(
  roundId: string,
  input: unknown,
  now = new Date(),
) {
  const data = parseBody(patrolRecordSchema, input);
  const [round, student] = await Promise.all([
    prisma.patrolRound.findUnique({
      where: { id: roundId },
      select: { endedAt: true },
    }),
    prisma.student.findUnique({
      where: { id: data.studentId },
      select: { id: true, status: true },
    }),
  ]);
  if (!round) throw new MobileApiError("순찰 회차를 찾을 수 없습니다", 404);
  if (round.endedAt) throw new MobileApiError("이미 종료된 순찰입니다", 409);
  if (!student || student.status !== "ACTIVE") {
    throw new MobileApiError("재원 중인 학생을 찾을 수 없습니다", 404);
  }

  const record = await prisma.patrolRecord.upsert({
    where: {
      roundId_studentId: { roundId, studentId: data.studentId },
    },
    create: {
      checkedAt: now,
      note: data.note || null,
      roundId,
      status: data.status,
      studentId: data.studentId,
    },
    update: {
      checkedAt: now,
      note: data.note || null,
      status: data.status,
    },
    select: {
      checkedAt: true,
      id: true,
      note: true,
      status: true,
      student: { select: { name: true, seat: true } },
      studentId: true,
    },
  });
  return serializePatrolRecord(record);
}
