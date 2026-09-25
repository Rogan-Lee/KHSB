// 학부모 앱 — 오늘·출결 달력·공부 시간 통계.
// 개인정보: AttendanceRecord.notes, 쪽잠·휴대폰 검사 메모, 처리자 이름은 절대 내보내지 않는다.
import { z } from "zod";

import type {
  AttendanceType,
  PhoneCheckStatus,
} from "@/generated/prisma";
import { MobileApiError } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { dayStudyMinutes } from "@/lib/study-time";

type ParentChildInfo = { id: string; name: string; grade: string; seat: string | null };

const ABSENT_TYPES = new Set<AttendanceType>([
  "ABSENT",
  "APPROVED_ABSENT",
  "NOTIFIED_ABSENT",
]);

const TYPE_LABEL: Partial<Record<AttendanceType, string>> = {
  TARDY: "지각",
  EARLY_LEAVE: "조퇴",
  ABSENT: "결석",
  APPROVED_ABSENT: "허가 결석",
  NOTIFIED_ABSENT: "사전 연락 결석",
};

const PHONE_LABEL: Record<PhoneCheckStatus, string> = {
  SUBMITTED: "제출했어요",
  NOT_SUBMITTED: "제출하지 않았어요",
  ABSENT: "입실 전이었어요",
  EXEMPT: "면제됐어요",
};

/** 등원하지 않은 같은 학년 학생을 빼고, 이 인원 미만이면 학년 평균을 보여주지 않는다 (개인 추정 방지) */
const MIN_GRADE_COHORT = 5;

// ─── KST 날짜 도우미 ─────────────────────────────────────────────────

const KST_MS = 9 * 60 * 60 * 1000;

function kstDateKey(d: Date): string {
  return new Date(d.getTime() + KST_MS).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → @db.Date 비교용 UTC 자정 */
function dbDate(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

function addDays(key: string, n: number): string {
  const d = dbDate(key);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(key: string): number {
  return dbDate(key).getUTCDay();
}

function kstMinutesOf(d: Date): number {
  const kst = new Date(d.getTime() + KST_MS);
  return kst.getUTCHours() * 60 + kst.getUTCMinutes();
}

function parseHm(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

function formatHm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start, end: `${month}-${String(last).padStart(2, "0")}` };
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** 해당 날짜가 속한 주의 월요일 */
function mondayOf(key: string): string {
  return addDays(key, -((weekdayOf(key) + 6) % 7));
}

function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let k = start; k <= end; k = addDays(k, 1)) out.push(k);
  return out;
}

// ─── 예정 시간 (요일별 입퇴실·외출 일정) ───────────────────────────────

type DaySchedule = { start: string | null; end: string | null; flexible: boolean };
type OutingPlan = { outStart: string; outEnd: string; reason: string | null };

async function loadPlans(studentId: string) {
  const [schedules, outingPlans] = await Promise.all([
    prisma.attendanceSchedule.findMany({
      where: { studentId },
      select: { dayOfWeek: true, startTime: true, endTime: true },
    }),
    prisma.outingSchedule.findMany({
      where: { studentId },
      orderBy: { outStart: "asc" },
      select: { dayOfWeek: true, outStart: true, outEnd: true, reason: true },
    }),
  ]);

  const byDay = new Map<number, DaySchedule>();
  for (const row of schedules) {
    const s = parseHm(row.startTime);
    const e = parseHm(row.endTime);
    const prev = byDay.get(row.dayOfWeek);
    const startMin = [s, parseHm(prev?.start)].filter((v): v is number => v != null);
    const endMin = [e, parseHm(prev?.end)].filter((v): v is number => v != null);
    byDay.set(row.dayOfWeek, {
      start: startMin.length ? formatHm(Math.min(...startMin)) : null,
      end: endMin.length ? formatHm(Math.max(...endMin)) : null,
      // "FLEXIBLE" 등 시각이 아닌 값 → 자율 등원
      flexible: (prev?.flexible ?? false) || s == null,
    });
  }

  const outingsByDay = new Map<number, OutingPlan[]>();
  for (const row of outingPlans) {
    const list = outingsByDay.get(row.dayOfWeek) ?? [];
    list.push({ outStart: row.outStart, outEnd: row.outEnd, reason: row.reason });
    outingsByDay.set(row.dayOfWeek, list);
  }

  return {
    schedule: (key: string) => byDay.get(weekdayOf(key)) ?? null,
    outingPlan: (key: string) => outingsByDay.get(weekdayOf(key)) ?? [],
    weekdays: [...byDay.keys()].sort(),
  };
}

// ─── 하루 모델 ───────────────────────────────────────────────────────

export type ParentDayStatus = "입실" | "외출" | "퇴실" | "미입실" | "결석";
export type ParentOutingStatus = "예정" | "외출중" | "복귀";

export type ParentOuting = {
  sequence: number;
  reason: string | null;
  /** 아직 나가지 않은 예정 외출 */
  planned: boolean;
  start: string | null;
  end: string | null;
  expectedStart: string | null;
  expectedEnd: string | null;
  status: ParentOutingStatus;
};

export type ParentDay = {
  date: string;
  weekday: number;
  status: ParentDayStatus;
  type: AttendanceType | null;
  typeLabel: string | null;
  isLate: boolean;
  lateMinutes: number | null;
  /** 등원 예정 요일인지 */
  scheduled: boolean;
  expected: { start: string | null; end: string | null; flexible: boolean };
  checkIn: string | null;
  checkOut: string | null;
  studyMinutes: number;
  outings: ParentOuting[];
};

type RecordRow = {
  date: Date;
  checkIn: Date | null;
  checkOut: Date | null;
  outStart: Date | null;
  outEnd: Date | null;
  type: AttendanceType;
};

type OutingRow = {
  date: Date;
  sequence: number;
  outStart: Date | null;
  outEnd: Date | null;
  reason: string | null;
  isPlaceholder: boolean;
};

const RECORD_SELECT = {
  date: true,
  checkIn: true,
  checkOut: true,
  outStart: true,
  outEnd: true,
  type: true,
} as const;

const OUTING_SELECT = {
  date: true,
  sequence: true,
  outStart: true,
  outEnd: true,
  reason: true,
  isPlaceholder: true,
} as const;

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function buildDay(input: {
  key: string;
  record: RecordRow | null;
  outings: OutingRow[];
  schedule: DaySchedule | null;
  plan: OutingPlan[];
  isToday: boolean;
  now: Date;
}): ParentDay {
  const { key, record, schedule, plan, isToday, now } = input;

  // 실제 외출 (예정 placeholder 제외). 기록이 DailyOuting 도입 전(레거시)이면 AttendanceRecord 의 외출 1건.
  const actual = input.outings
    .filter((o) => !o.isPlaceholder && o.outStart)
    .sort((a, b) => a.sequence - b.sequence);
  const actualList: { sequence: number; start: Date; end: Date | null; reason: string | null }[] =
    actual.length > 0
      ? actual.map((o) => ({ sequence: o.sequence, start: o.outStart!, end: o.outEnd, reason: o.reason }))
      : record?.outStart
        ? [{ sequence: 1, start: record.outStart, end: record.outEnd, reason: null }]
        : [];

  const outings: ParentOuting[] = actualList.map((o, i) => {
    // 예정 외출과는 순서로 짝지음 (예정보다 많이 나간 날은 짝 없이)
    const p = plan[i];
    return {
      sequence: o.sequence,
      reason: o.reason ?? p?.reason ?? null,
      planned: false,
      start: o.start.toISOString(),
      end: iso(o.end),
      expectedStart: p?.outStart ?? null,
      expectedEnd: p?.outEnd ?? null,
      status: o.end ? "복귀" : "외출중",
    };
  });

  const absent = !!record && ABSENT_TYPES.has(record.type);
  const outingActive = outings.some((o) => o.status === "외출중");
  const status: ParentDayStatus = !record
    ? "미입실"
    : absent
      ? "결석"
      : record.checkOut
        ? "퇴실"
        : outingActive
          ? "외출"
          : record.checkIn
            ? "입실"
            : "미입실";

  // 오늘은 아직 나가지 않은 예정 외출도 보여준다
  if (isToday && !absent && !record?.checkOut) {
    const placeholders = input.outings.filter((o) => o.isPlaceholder && !o.outStart);
    plan.slice(actualList.length).forEach((p, i) => {
      outings.push({
        sequence: actualList.length + i + 1,
        reason: p.reason,
        planned: true,
        start: null,
        end: null,
        expectedStart: p.outStart,
        expectedEnd: p.outEnd,
        status: "예정",
      });
    });
    if (plan.length === 0) {
      placeholders.forEach((o, i) =>
        outings.push({
          sequence: actualList.length + i + 1,
          reason: o.reason,
          planned: true,
          start: null,
          end: null,
          expectedStart: null,
          expectedEnd: null,
          status: "예정",
        }),
      );
    }
  }

  const isLate = record?.type === "TARDY";
  const startMin = parseHm(schedule?.start);
  let lateMinutes: number | null = null;
  if (isLate && record?.checkIn && startMin != null) {
    const diff = kstMinutesOf(record.checkIn) - startMin;
    if (diff > 0 && diff < 240) lateMinutes = diff;
  }

  return {
    date: key,
    weekday: weekdayOf(key),
    status,
    type: record?.type ?? null,
    typeLabel: record ? (TYPE_LABEL[record.type] ?? null) : null,
    isLate,
    lateMinutes,
    scheduled: !!schedule,
    expected: {
      start: schedule?.start ?? null,
      end: schedule?.end ?? null,
      flexible: schedule?.flexible ?? false,
    },
    checkIn: iso(record?.checkIn ?? null),
    checkOut: iso(record?.checkOut ?? null),
    studyMinutes: absent
      ? 0
      : dayStudyMinutes(
          record,
          input.outings.filter((o) => !o.isPlaceholder),
          { now, live: isToday },
        ),
    outings,
  };
}

// ─── 오늘 ────────────────────────────────────────────────────────────

export async function getParentToday(child: ParentChildInfo, now = new Date()) {
  const key = kstDateKey(now);
  const date = dbDate(key);

  const [plans, record, outings, naps, phone, notice] = await Promise.all([
    loadPlans(child.id),
    prisma.attendanceRecord.findUnique({
      where: { studentId_date: { studentId: child.id, date } },
      select: RECORD_SELECT,
    }),
    prisma.dailyOuting.findMany({
      where: { studentId: child.id, date },
      orderBy: { sequence: "asc" },
      select: OUTING_SELECT,
    }),
    // 승인된 쪽잠만 (학생 메모·처리자 제외)
    prisma.napRequest.findMany({
      where: { studentId: child.id, date, status: "APPROVED" },
      orderBy: { startTime: "asc" },
      select: { id: true, startTime: true, durationMin: true },
    }),
    prisma.phoneCheckRecord.findUnique({
      where: { studentId_date: { studentId: child.id, date } },
      select: { status: true, updatedAt: true },
    }),
    // 학부모 월간 리포트의 "운영 공지"와 같은 공지
    prisma.announcement.findFirst({
      where: { page: "monthly_notice" },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, content: true, createdAt: true, updatedAt: true },
    }),
  ]);

  const schedule = plans.schedule(key);
  const day = buildDay({
    key,
    record,
    outings,
    schedule,
    plan: plans.outingPlan(key),
    isToday: true,
    now,
  });

  const startMin = parseHm(schedule?.start);
  const overdue =
    day.status === "미입실" &&
    !!schedule &&
    !schedule.flexible &&
    startMin != null &&
    kstMinutesOf(now) >= startMin + 30;

  return {
    ...day,
    child,
    now: now.toISOString(),
    overdue,
    naps: naps.map((n) => ({
      id: n.id,
      startTime: n.startTime,
      durationMin: n.durationMin,
    })),
    phoneCheck: phone
      ? { status: phone.status, label: PHONE_LABEL[phone.status], checkedAt: phone.updatedAt.toISOString() }
      : null,
    notice: notice
      ? {
          id: notice.id,
          title: notice.title.trim() || "독서실 공지",
          content: notice.content.slice(0, 4000),
          createdAt: notice.createdAt.toISOString(),
          updatedAt: notice.updatedAt.toISOString(),
        }
      : null,
  };
}

// ─── 월간 출결 (달력) ────────────────────────────────────────────────

const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "월 형식이 올바르지 않아요");

export async function getParentAttendanceMonth(
  child: ParentChildInfo,
  monthInput: string | null,
  now = new Date(),
) {
  const todayKey = kstDateKey(now);
  const parsed = monthSchema.safeParse(monthInput ?? todayKey.slice(0, 7));
  if (!parsed.success) throw new MobileApiError("월 형식이 올바르지 않아요", 400);
  const month = parsed.data;
  const { start, end } = monthBounds(month);

  const [plans, records, outings, student] = await Promise.all([
    loadPlans(child.id),
    prisma.attendanceRecord.findMany({
      where: { studentId: child.id, date: { gte: dbDate(start), lte: dbDate(end) } },
      orderBy: { date: "desc" },
      select: RECORD_SELECT,
    }),
    prisma.dailyOuting.findMany({
      where: { studentId: child.id, date: { gte: dbDate(start), lte: dbDate(end) } },
      orderBy: [{ date: "asc" }, { sequence: "asc" }],
      select: OUTING_SELECT,
    }),
    prisma.student.findUnique({ where: { id: child.id }, select: { startDate: true } }),
  ]);

  const outingsByDate = new Map<string, OutingRow[]>();
  for (const o of outings) {
    const k = o.date.toISOString().slice(0, 10);
    outingsByDate.set(k, [...(outingsByDate.get(k) ?? []), o]);
  }

  const items = records.map((record) => {
    const key = record.date.toISOString().slice(0, 10);
    return buildDay({
      key,
      record,
      outings: outingsByDate.get(key) ?? [],
      schedule: plans.schedule(key),
      plan: plans.outingPlan(key),
      isToday: key === todayKey,
      now,
    });
  });

  const present = items.filter((d) => d.checkIn && d.status !== "결석");
  return {
    month,
    today: todayKey,
    firstMonth: student?.startDate ? kstDateKey(student.startDate).slice(0, 7) : null,
    scheduleWeekdays: plans.weekdays,
    summary: {
      present: present.length,
      late: items.filter((d) => d.isLate).length,
      absent: items.filter((d) => d.status === "결석").length,
      earlyLeave: items.filter((d) => d.type === "EARLY_LEAVE").length,
      outings: items.reduce((n, d) => n + d.outings.filter((o) => !o.planned).length, 0),
      studyMinutes: items.reduce((n, d) => n + d.studyMinutes, 0),
    },
    items,
  };
}

// ─── 공부 시간 통계 (주간·월간) ───────────────────────────────────────

const statsSchema = z.object({
  range: z.enum(["week", "month"]),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

function periodOf(range: "week" | "month", key: string) {
  if (range === "week") {
    const start = mondayOf(key);
    return { start, end: addDays(start, 6), prevStart: addDays(start, -7), prevEnd: addDays(start, -1) };
  }
  const month = key.slice(0, 7);
  const cur = monthBounds(month);
  const prev = monthBounds(shiftMonth(month, -1));
  return { start: cur.start, end: cur.end, prevStart: prev.start, prevEnd: prev.end };
}

/** 학생별 날짜별 순공 분 */
async function studyMinutesByDay(
  studentIds: string[],
  start: string,
  end: string,
  todayKey: string,
  now: Date,
) {
  const where = { studentId: { in: studentIds }, date: { gte: dbDate(start), lte: dbDate(end) } };
  const [records, outings] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where,
      select: { ...RECORD_SELECT, studentId: true },
    }),
    prisma.dailyOuting.findMany({
      where: { ...where, isPlaceholder: false },
      select: { studentId: true, date: true, outStart: true, outEnd: true },
    }),
  ]);

  const outingMap = new Map<string, { outStart: Date | null; outEnd: Date | null }[]>();
  for (const o of outings) {
    const k = `${o.studentId}|${o.date.toISOString().slice(0, 10)}`;
    outingMap.set(k, [...(outingMap.get(k) ?? []), o]);
  }

  const result = new Map<string, Map<string, number>>();
  for (const r of records) {
    const key = r.date.toISOString().slice(0, 10);
    if (ABSENT_TYPES.has(r.type) || !r.checkIn) continue;
    const minutes = dayStudyMinutes(r, outingMap.get(`${r.studentId}|${key}`) ?? [], {
      now,
      live: key === todayKey,
    });
    const byDay = result.get(r.studentId) ?? new Map<string, number>();
    byDay.set(key, minutes);
    result.set(r.studentId, byDay);
  }
  return result;
}

export async function getParentStudyStats(
  child: ParentChildInfo,
  input: { range: string | null; date: string | null },
  now = new Date(),
) {
  const parsed = statsSchema.safeParse({ range: input.range ?? "week", date: input.date });
  if (!parsed.success) throw new MobileApiError("조회 조건이 올바르지 않아요", 400);
  const { range } = parsed.data;
  const todayKey = kstDateKey(now);
  const anchor = parsed.data.date && parsed.data.date <= todayKey ? parsed.data.date : todayKey;
  const p = periodOf(range, anchor);

  const mine = (await studyMinutesByDay([child.id], p.prevStart, p.end, todayKey, now)).get(child.id);
  const minutesOf = (k: string) => mine?.get(k) ?? 0;

  const days = daysBetween(p.start, p.end).map((k) => ({
    date: k,
    weekday: weekdayOf(k),
    minutes: minutesOf(k),
    attended: mine?.has(k) ?? false,
    future: k > todayKey,
    today: k === todayKey,
  }));
  const total = days.reduce((n, d) => n + d.minutes, 0);
  const attendedDays = days.filter((d) => d.attended).length;
  // 하루 평균은 공부 시간이 잡힌 날로 — 진행 중인 오늘·퇴실 기록이 없는 날은 빼고 (오늘뿐이면 오늘 포함)
  const doneDays = days.filter((d) => d.minutes > 0 && !d.today);
  const avgDays = doneDays.length > 0 ? doneDays : days.filter((d) => d.minutes > 0);
  const dailyAverage = avgDays.length
    ? Math.round(avgDays.reduce((n, d) => n + d.minutes, 0) / avgDays.length)
    : 0;

  // 전 기간 — 진행 중인 기간이면 "같은 시점까지"로 비교 (지난주 이맘때)
  const prevDays = daysBetween(p.prevStart, p.prevEnd);
  const prevTotal = prevDays.reduce((n, k) => n + minutesOf(k), 0);
  const inProgress = p.start <= todayKey && todayKey <= p.end;
  const elapsed = inProgress ? daysBetween(p.start, todayKey).length : prevDays.length;
  const prevComparable = prevDays.slice(0, elapsed).reduce((n, k) => n + minutesOf(k), 0);

  // 같은 학년 평균 — 이 기간에 한 번이라도 등원한 학생만, 인원이 적으면 숨김
  const cohort = await prisma.student.findMany({
    where: { status: "ACTIVE", grade: child.grade },
    select: { id: true },
  });
  let gradeAverage: { totalMinutes: number; dailyMinutes: number; cohortSize: number } | null = null;
  if (cohort.length >= MIN_GRADE_COHORT) {
    const all = await studyMinutesByDay(
      cohort.map((c) => c.id),
      p.start,
      p.end > todayKey ? todayKey : p.end,
      todayKey,
      now,
    );
    const active = [...all.values()].filter((m) => [...m.values()].some((v) => v > 0));
    if (active.length >= MIN_GRADE_COHORT) {
      const sum = active.reduce((n, m) => n + [...m.values()].reduce((a, b) => a + b, 0), 0);
      // 하루 평균: 우리 아이와 같은 규칙 (진행 중인 오늘 제외, 공부 시간이 잡힌 날만)
      const done = active.flatMap((m) => [...m.entries()].filter(([k, v]) => v > 0 && k !== todayKey));
      const doneList = done.length > 0 ? done : active.flatMap((m) => [...m.entries()].filter(([, v]) => v > 0));
      gradeAverage = {
        totalMinutes: Math.round(sum / active.length),
        dailyMinutes: doneList.length
          ? Math.round(doneList.reduce((n, [, v]) => n + v, 0) / doneList.length)
          : 0,
        cohortSize: active.length,
      };
    }
  }

  return {
    range,
    start: p.start,
    end: p.end,
    today: todayKey,
    inProgress,
    days,
    totalMinutes: total,
    attendedDays,
    dailyAverageMinutes: dailyAverage,
    previous: {
      start: p.prevStart,
      end: p.prevEnd,
      totalMinutes: prevTotal,
      comparableMinutes: prevComparable,
    },
    gradeAverage,
  };
}
