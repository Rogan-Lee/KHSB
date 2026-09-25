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
  duration?: number;
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

function sanitizeItems(items: StudentPlanItem[]): StudentPlanItem[] {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 50).map((it) => ({
    id: String(it.id ?? "").slice(0, 40),
    text: String(it.text ?? "").slice(0, 200),
    done: Boolean(it.done),
    colorCode: String(it.colorCode ?? "blue").slice(0, 20),
    ...(typeof it.duration === "number" && Number.isFinite(it.duration)
      ? { duration: Math.max(0, Math.min(1440, Math.round(it.duration))) }
      : {}),
  }));
}

/** 오늘/내일 공부 계획 저장 (항목 전체 교체, 메모는 보존). */
export async function saveDailyPlanForStudent(
  studentId: string,
  dateStr: string, // "YYYY-MM-DD" — 오늘 또는 내일만 허용
  rawItems: StudentPlanItem[],
) {
  const today = todayKST();
  const allowed = [isoDate(today), isoDate(addDays(today, 1))];
  if (!allowed.includes(dateStr)) {
    throw new MobileApiError("오늘 또는 내일 계획만 수정할 수 있습니다", 400);
  }

  const date = new Date(dateStr);
  const items = sanitizeItems(rawItems);

  await prisma.dailyPlan.upsert({
    where: { studentId_date: { studentId, date } },
    create: { studentId, date, items },
    update: { items },
  });

  revalidatePath("/timetable");
  return { ok: true };
}
