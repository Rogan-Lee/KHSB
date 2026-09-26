import { z } from "zod";

import type { CalendarEventType, User } from "@/generated/prisma";
import { getAttentionStudents } from "@/lib/attention";
import { getStaffBadges } from "@/lib/mobile-badges";
import { MobileApiError } from "@/lib/mobile-auth";
import { staffCapabilities } from "@/lib/mobile-capabilities";
import {
  getKstDayContext,
  getStaffMobileAttendance,
  getStaffMobileMentoring,
} from "@/lib/mobile-data";
import { getMobileStaffTasks } from "@/lib/mobile-tasks";
import { prisma } from "@/lib/prisma";
import { isStaff } from "@/lib/roles";

// 직원 앱 홈(오늘) · 일정 · 내 할 일.
// 홈은 여러 출처를 모으므로 항목별 실패를 허용한다 — 한 항목이 실패해도 나머지는 보여 주고,
// 실패한 키는 failed[] 로 알려 준다. capabilities 에 없는 항목은 null (해당 없음).

type StaffUser = Pick<User, "id" | "name" | "role">;

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_MS = 9 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ─── KST 날짜 도우미 ───────────────────────────────────────────────

function kstDateKey(d: Date) {
  return new Date(d.getTime() + KST_MS).toISOString().slice(0, 10);
}
function kstTime(d: Date) {
  return new Date(d.getTime() + KST_MS).toISOString().slice(11, 16);
}
function kstDayStart(key: string) {
  return new Date(`${key}T00:00:00+09:00`);
}
function addDaysKey(key: string, days: number) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function dayOfWeekOf(key: string) {
  return new Date(`${key}T00:00:00Z`).getUTCDay();
}

// ─── 공용 직렬화 ───────────────────────────────────────────────────

export const CALENDAR_TYPE_LABEL: Record<CalendarEventType, string> = {
  SCHOOL_EXAM: "학교 시험",
  SCHOOL_EVENT: "학교 행사",
  PERSONAL: "개인 일정",
  PLATFORM: "플랫폼",
};

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  startDate: Date;
  endDate: Date | null;
  allDay: boolean;
  type: CalendarEventType;
  color: string | null;
  schoolName: string | null;
  student: { id: string; name: string } | null;
};

const eventSelect = {
  id: true,
  title: true,
  description: true,
  startDate: true,
  endDate: true,
  allDay: true,
  type: true,
  color: true,
  schoolName: true,
  student: { select: { id: true, name: true } },
} as const;

function serializeEvent(e: EventRow) {
  const startKey = kstDateKey(e.startDate);
  const endKey = e.endDate ? kstDateKey(e.endDate) : startKey;
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    type: e.type,
    typeLabel: CALENDAR_TYPE_LABEL[e.type],
    color: e.color,
    allDay: e.allDay,
    startDate: startKey,
    endDate: endKey,
    startTime: e.allDay ? null : kstTime(e.startDate),
    endTime: e.allDay || !e.endDate ? null : kstTime(e.endDate),
    schoolName: e.schoolName,
    studentId: e.student?.id ?? null,
    studentName: e.student?.name ?? null,
  };
}

/** [fromKey, toKey] (KST 날짜, 양끝 포함) 에 걸치는 일정 — 여러 날 일정 포함 */
function eventsInRange(fromKey: string, toKey: string) {
  const start = kstDayStart(fromKey);
  const end = new Date(kstDayStart(toKey).getTime() + DAY_MS);
  return prisma.calendarEvent.findMany({
    where: {
      OR: [
        { startDate: { gte: start, lt: end } },
        { startDate: { lt: start }, endDate: { gte: start } },
      ],
    },
    orderBy: [{ allDay: "desc" }, { startDate: "asc" }],
    select: eventSelect,
    take: 500,
  });
}

async function mentorShifts(userId: string, dayOfWeek?: number) {
  const rows = await prisma.mentorSchedule.findMany({
    where: {
      ...(dayOfWeek !== undefined ? { dayOfWeek } : {}),
      mentor: { status: "ACTIVE" },
    },
    orderBy: [{ timeStart: "asc" }],
    select: {
      dayOfWeek: true,
      timeStart: true,
      timeEnd: true,
      mentor: { select: { id: true, name: true } },
    },
  });
  return rows.map((r) => ({
    dayOfWeek: r.dayOfWeek,
    mentorId: r.mentor.id,
    name: r.mentor.name,
    timeStart: r.timeStart,
    timeEnd: r.timeEnd,
    isMe: r.mentor.id === userId,
  }));
}

const TODO_PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

async function myOpenTodos(userId: string) {
  const rows = await prisma.todo.findMany({
    where: {
      isCompleted: false,
      OR: [{ assigneeId: userId }, { authorId: userId, assigneeId: null }],
    },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: 50,
    select: {
      id: true,
      title: true,
      priority: true,
      dueDate: true,
      category: true,
      authorId: true,
      authorName: true,
      assigneeId: true,
    },
  });
  const sorted = rows.sort((a, b) => {
    const ap = TODO_PRIORITY_RANK[a.priority] ?? 9;
    const bp = TODO_PRIORITY_RANK[b.priority] ?? 9;
    if (ap !== bp) return ap - bp;
    const ad = a.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
    const bd = b.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
    return ad - bd;
  });
  return {
    total: sorted.length,
    items: sorted.slice(0, 5).map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
      category: t.category,
      // 다른 사람이 나에게 맡긴 할 일이면 요청자 이름
      assignedBy: t.assigneeId === userId && t.authorId !== userId ? t.authorName : null,
    })),
  };
}

// ─── 홈 (오늘) ─────────────────────────────────────────────────────

export async function getMobileStaffToday(user: StaffUser, now = new Date()) {
  const caps = staffCapabilities(user.role);
  const ctx = getKstDayContext(now);
  const failed: string[] = [];

  async function part<T>(key: string, enabled: boolean, run: () => Promise<T>): Promise<T | null> {
    if (!enabled) return null;
    try {
      return await run();
    } catch (error) {
      console.error(`[mobile-staff-today:${key}]`, error);
      failed.push(key);
      return null;
    }
  }

  const off = caps.offlineOps;
  const since = new Date(ctx.date);
  since.setUTCDate(since.getUTCDate() - 13);

  const [
    badges,
    attendance,
    mentoring,
    openQuestions,
    unreadHandovers,
    attention,
    events,
    mentors,
    todos,
    patrol,
    tasks,
    sessions,
  ] = await Promise.all([
    part("badges", true, () => getStaffBadges(user.id, user.role)),
    part("attendance", off, () => getStaffMobileAttendance(now)),
    part("mentoring", off, () => getStaffMobileMentoring(user.id, user.role, now)),
    part("questions", off, () =>
      prisma.studentQuestion.count({ where: { status: "OPEN", student: { status: "ACTIVE" } } }),
    ),
    // 미확인 인수인계 — 최근 14일, 내가 쓴 것 제외, 내가 "확인"하지 않은 것 (웹 대시보드와 같은 기준)
    part("handovers", off, () =>
      prisma.handover.count({
        where: {
          date: { gte: since },
          authorId: { not: user.id },
          reads: { none: { userId: user.id, confirmedAt: { not: null } } },
        },
      }),
    ),
    part("attention", off, () => getAttentionStudents()),
    part("events", true, () => eventsInRange(ctx.dateKey, ctx.dateKey)),
    part("mentors", off, () => mentorShifts(user.id, ctx.dayOfWeek)),
    part("todos", true, () => myOpenTodos(user.id)),
    part("patrol", off, async () => {
      const round = await prisma.patrolRound.findFirst({
        where: { endedAt: null },
        orderBy: { startedAt: "desc" },
        select: {
          id: true,
          label: true,
          startedAt: true,
          patrollerName: true,
          _count: { select: { records: true } },
        },
      });
      if (!round) return null;
      const rosterCount = await prisma.attendanceRecord.count({
        where: { checkIn: { not: null }, date: ctx.date },
      });
      return {
        id: round.id,
        label: round.label,
        startedAt: round.startedAt.toISOString(),
        patrollerName: round.patrollerName,
        checkedCount: round._count.records,
        rosterCount,
      };
    }),
    // 수행평가 — 전 직원(원장은 전체, 그 외 담당 학생) · /staff/tasks 목록과 같은 범위
    part("tasks", true, () => getMobileStaffTasks({ id: user.id, role: user.role }, now)),
    // 온라인 화상 관리 세션 — 내가 호스트인 오늘~내일 예정
    part("sessions", caps.onlineModule, async () => {
      const rows = await prisma.mentoringSession.findMany({
        where: {
          hostId: user.id,
          status: { in: ["SCHEDULED", "IN_PROGRESS"] },
          scheduledAt: {
            gte: new Date(now.getTime() - 60 * 60 * 1000),
            lt: new Date(ctx.end.getTime() + DAY_MS),
          },
        },
        orderBy: { scheduledAt: "asc" },
        take: 5,
        select: {
          id: true,
          title: true,
          scheduledAt: true,
          durationMinutes: true,
          status: true,
          meetUrl: true,
          student: { select: { id: true, name: true, grade: true } },
        },
      });
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        scheduledAt: r.scheduledAt.toISOString(),
        durationMinutes: r.durationMinutes,
        inProgress: r.status === "IN_PROGRESS",
        meetUrl: r.meetUrl,
        studentId: r.student.id,
        studentName: r.student.name,
        grade: r.student.grade,
      }));
    }),
  ]);

  const attentionList = attention ?? null;
  const eventList = events ? events.map(serializeEvent) : null;

  return {
    date: ctx.dateKey,
    priorities: {
      approvals: off && badges ? badges.approvals : null,
      openQuestions: openQuestions ?? null,
      mentoringRecords: mentoring ? mentoring.summary.needsRecord : null,
      lunchRequests: off && badges ? badges.lunchRequests : null,
      unreadHandovers: unreadHandovers ?? null,
      suggestions: off && badges ? badges.suggestions : null,
      tasksNeedFeedback: tasks ? tasks.summary.needsFeedback : null,
      unreadMessages: badges ? badges.chats + badges.dm : null,
    },
    attendance: attendance
      ? {
          present: attendance.items.filter((i) => i.status === "입실").length,
          away: attendance.summary.away,
          notArrived: attendance.items.filter((i) => i.status === "미입실").length,
          late: attendance.summary.late,
          absent: attendance.summary.absent,
          total: attendance.summary.total,
        }
      : null,
    mentoringToday: mentoring ? mentoring.summary.today : null,
    attention: attentionList
      ? {
          total: attentionList.length,
          items: attentionList.slice(0, 5).map((s) => ({
            studentId: s.studentId,
            name: s.name,
            grade: s.grade,
            seat: s.seat,
            severity: s.severity,
            isManual: s.isManual,
            reasons: s.reasons.map((r) => r.label),
          })),
        }
      : null,
    events: eventList ? { total: eventList.length, items: eventList.slice(0, 6) } : null,
    workingMentors: mentors,
    todos,
    patrol: patrol ?? null,
    sessions,
    failed,
  };
}

// ─── 일정 (캘린더 아젠다) ──────────────────────────────────────────

/** 이번 주 월요일(KST) */
function weekStartKey(todayKey: string) {
  const dow = dayOfWeekOf(todayKey);
  return addDaysKey(todayKey, dow === 0 ? -6 : 1 - dow);
}

export async function getMobileStaffCalendar(
  user: StaffUser,
  fromParam: string | null,
  toParam: string | null,
) {
  const today = getKstDayContext().dateKey;
  const from = fromParam && DATE_RE.test(fromParam) ? fromParam : weekStartKey(today);
  const to = toParam && DATE_RE.test(toParam) ? toParam : addDaysKey(from, 6);
  const span = Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY_MS,
  );
  if (span < 0) throw new MobileApiError("조회 기간을 확인하세요", 400);
  if (span > 62) throw new MobileApiError("한 번에 최대 두 달까지 볼 수 있어요", 400);

  const caps = staffCapabilities(user.role);
  const [events, shifts] = await Promise.all([
    eventsInRange(from, to),
    caps.offlineOps ? mentorShifts(user.id) : Promise.resolve([]),
  ]);
  const serialized = events.map(serializeEvent);

  const days = [];
  for (let i = 0; i <= span; i += 1) {
    const key = addDaysKey(from, i);
    const dow = dayOfWeekOf(key);
    days.push({
      date: key,
      dayOfWeek: dow,
      isToday: key === today,
      events: serialized.filter((e) => e.startDate <= key && key <= e.endDate),
      mentors: shifts
        .filter((s) => s.dayOfWeek === dow)
        .map(({ mentorId, name, timeStart, timeEnd, isMe }) => ({
          mentorId,
          name,
          timeStart,
          timeEnd,
          isMe,
        })),
    });
  }

  return { from, to, today, days };
}

// ─── 내 할 일 완료 토글 ────────────────────────────────────────────

const todoSchema = z.object({ completed: z.boolean() });

/**
 * 웹 toggleTodo 와 같은 규칙 — 완료 시각 기록/해제. 명시적 상태로 받아 중복 탭에도 안전.
 * 범위는 웹 getTodos 와 같게: 오프라인 운영진(isStaff)은 전체, 온라인 전용 역할은 본인이 쓰거나 맡은 할 일만.
 */
export async function setMobileTodoCompleted(
  user: Pick<User, "id" | "role">,
  todoId: string,
  input: unknown,
) {
  const parsed = todoSchema.safeParse(input);
  if (!parsed.success) throw new MobileApiError("입력값을 확인하세요", 400);
  const existing = await prisma.todo.findUnique({
    where: { id: todoId },
    select: { id: true, authorId: true, assigneeId: true },
  });
  const visible =
    !!existing &&
    (isStaff(user.role) || existing.authorId === user.id || existing.assigneeId === user.id);
  if (!visible) throw new MobileApiError("할 일을 찾을 수 없습니다", 404);
  const todo = await prisma.todo.update({
    where: { id: todoId },
    data: {
      isCompleted: parsed.data.completed,
      completedAt: parsed.data.completed ? new Date() : null,
    },
    select: { id: true, isCompleted: true },
  });
  return todo;
}
