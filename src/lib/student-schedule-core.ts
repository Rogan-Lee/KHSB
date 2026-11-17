import { revalidatePath } from "next/cache";

import { MobileApiError } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { parseSchool, todayKST } from "@/lib/utils";

// 학생 "내 일정"(시간표·캘린더 일정·오늘/내일 공부 계획) 핵심 로직 — 학생 ID 기준.
// 인증은 호출 측 책임: 웹 서버 액션(src/actions/student-schedule.ts, 매직링크 토큰)과
// 학생 앱(src/lib/mobile-student-plan.ts, requireMobileStudent)이 같이 쓴다.

export type StudentTimetableEntry = {
  id: string;
  dayOfWeek: number; // 1=월 … 6=토, 0=일
  startTime: string; // "HH:MM"
  endTime: string;
  subject: string;
  details: string | null;
  colorCode: string;
  allDay: boolean;
};

export type StudentCalendarEvent = {
  id: string;
  title: string;
  type: string;
  startDate: string; // ISO
  endDate: string | null;
  allDay: boolean;
};

export type StudentPlanItem = {
  id: string;
  text: string;
  done: boolean;
  colorCode: string;
  /** 목표 시간(분) */
  duration?: number;
  /** 과목 — 플래너 과목 칩 (없으면 색만) */
  subject?: string;
};

export type StudentDailyPlan = {
  date: string; // "YYYY-MM-DD"
  items: StudentPlanItem[];
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/** 이번 주 월요일 (KST 자정, UTC midnight Date). */
function weekStartKST(): Date {
  const today = todayKST();
  const dow = today.getUTCDay(); // 0=일
  return addDays(today, dow === 0 ? -6 : 1 - dow);
}

/** 학생의 이번 주 시간표 + 캘린더 일정(본인 일정 + 학교 시험·행사). */
export async function getWeekScheduleForStudent(student: {
  id: string;
  school: string | null;
}): Promise<{
  weekStart: string; // 월요일 "YYYY-MM-DD"
  timetable: StudentTimetableEntry[];
  events: StudentCalendarEvent[];
}> {
  const monday = weekStartKST();
  const weekEnd = addDays(monday, 7);
  const schoolName = student.school ? parseSchool(student.school) : null;

  const [timetable, events] = await Promise.all([
    prisma.timetableEntry.findMany({
      where: { studentId: student.id },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      select: {
        id: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        subject: true,
        details: true,
        colorCode: true,
        allDay: true,
      },
    }),
    prisma.calendarEvent.findMany({
      where: {
        AND: [
          {
            OR: [
              { studentId: student.id },
              ...(schoolName
                ? [
                    {
                      schoolName,
                      type: { in: ["SCHOOL_EXAM", "SCHOOL_EVENT"] as ("SCHOOL_EXAM" | "SCHOOL_EVENT")[] },
                    },
                  ]
                : []),
            ],
          },
          { startDate: { lt: weekEnd } },
          { OR: [{ endDate: null, startDate: { gte: monday } }, { endDate: { gte: monday } }] },
        ],
      },
      orderBy: { startDate: "asc" },
      select: {
        id: true,
        title: true,
        type: true,
        startDate: true,
        endDate: true,
        allDay: true,
      },
    }),
  ]);

  return {
    weekStart: isoDate(monday),
    timetable,
    events: events.map((ev) => ({
      ...ev,
      startDate: ev.startDate.toISOString(),
      endDate: ev.endDate?.toISOString() ?? null,
    })),
  };
}

/** 오늘·내일 공부 계획 (DailyPlan). 없으면 빈 항목. */
export async function getDailyPlansForStudent(studentId: string): Promise<{
  today: StudentDailyPlan;
  tomorrow: StudentDailyPlan;
}> {
  const today = todayKST();
  const tomorrow = addDays(today, 1);

  const plans = await prisma.dailyPlan.findMany({
    where: { studentId, date: { in: [today, tomorrow] } },
    select: { date: true, items: true },
  });

  const pick = (d: Date): StudentDailyPlan => {
    const row = plans.find((p) => p.date.getTime() === d.getTime());
    return {
      date: isoDate(d),
      items: ((row?.items as StudentPlanItem[]) ?? []).filter(Boolean),
    };
  };

  return { today: pick(today), tomorrow: pick(tomorrow) };
}

/**
 * JSON 컬럼에 클라이언트 객체를 그대로 저장하지 않고 알려진 필드만 길이 제한해 남긴다.
 * 학생(앱·포털)과 직원 시간표(actions/daily-plan)가 같은 목록을 고치므로 둘 다 이 함수를 쓴다 —
 * 한쪽에만 필드를 더하면 다른 쪽이 저장할 때 그 필드가 지워진다.
 */
export function sanitizePlanItems(
  items: StudentPlanItem[],
  limits: { maxItems: number; textMax: number } = { maxItems: 50, textMax: 200 },
): StudentPlanItem[] {
  if (!Array.isArray(items)) return [];
  return items.slice(0, limits.maxItems).map((it) => {
    const subject = typeof it?.subject === "string" ? it.subject.trim().slice(0, 20) : "";
    return {
      id: String(it?.id ?? "").slice(0, 40),
      text: String(it?.text ?? "").slice(0, limits.textMax),
      done: Boolean(it?.done),
      colorCode: String(it?.colorCode ?? "blue").slice(0, 20),
      ...(typeof it?.duration === "number" && Number.isFinite(it.duration)
        ? { duration: Math.max(0, Math.min(1440, Math.round(it.duration))) }
        : {}),
      ...(subject ? { subject } : {}),
    };
  });
}

/** 학생이 고칠 수 있는 날짜 — 지난 7일(늦게 체크)부터 4주 뒤까지 */
export const PLAN_EDIT_PAST_DAYS = 7;
export const PLAN_EDIT_FUTURE_DAYS = 28;
/** 한 번에 조회할 수 있는 최대 일수 (월 달력 6주) */
export const PLAN_RANGE_MAX_DAYS = 42;

function assertEditable(dateStr: string, today: Date) {
  const from = isoDate(addDays(today, -PLAN_EDIT_PAST_DAYS));
  const to = isoDate(addDays(today, PLAN_EDIT_FUTURE_DAYS));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || dateStr < from || dateStr > to) {
    throw new MobileApiError("지난 7일부터 4주 뒤까지의 계획만 고칠 수 있어요", 400);
  }
}

/** 기간 안 날짜별 공부 계획 — 계획이 없는 날도 빈 목록으로 채운다. */
export async function getDailyPlansRange(
  studentId: string,
  fromStr: string,
  toStr: string,
): Promise<StudentDailyPlan[]> {
  const from = new Date(fromStr);
  const to = new Date(toStr);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  if (Number.isNaN(days) || days < 1 || days > PLAN_RANGE_MAX_DAYS) {
    throw new MobileApiError("조회 기간을 확인해 주세요", 400);
  }
  const rows = await prisma.dailyPlan.findMany({
    where: { studentId, date: { gte: from, lte: to } },
    select: { date: true, items: true },
  });
  const byDate = new Map(rows.map((r) => [isoDate(r.date), r.items as StudentPlanItem[]]));
  return Array.from({ length: days }, (_, i) => {
    const date = isoDate(addDays(from, i));
    return { date, items: (byDate.get(date) ?? []).filter(Boolean) };
  });
}

/**
 * 여러 날짜 계획을 한 번에 저장 (날짜마다 항목 전체 교체, 메모는 보존) —
 * "내일로 미루기"처럼 두 날짜를 같이 바꿀 때 한쪽만 저장되는 일이 없게 트랜잭션으로.
 */
export async function saveDailyPlansForStudent(studentId: string, days: { date: string; items: StudentPlanItem[] }[]) {
  const today = todayKST();
  for (const d of days) assertEditable(d.date, today);

  await prisma.$transaction(
    days.map((d) => {
      const date = new Date(d.date);
      const items = sanitizePlanItems(d.items);
      return prisma.dailyPlan.upsert({
        where: { studentId_date: { studentId, date } },
        create: { studentId, date, items },
        update: { items },
      });
    }),
  );

  revalidatePath("/timetable");
  return { ok: true };
}

/** 하루 계획 저장 — 예전 앱·웹 포털(오늘/내일 화면)용 */
export function saveDailyPlanForStudent(studentId: string, dateStr: string, rawItems: StudentPlanItem[]) {
  return saveDailyPlansForStudent(studentId, [{ date: dateStr, items: rawItems }]);
}
