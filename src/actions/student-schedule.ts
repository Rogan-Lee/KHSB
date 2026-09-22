"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { validateMagicLink } from "@/lib/student-auth";
import { parseSchool, todayKST } from "@/lib/utils";

// ── 타입 ────────────────────────────────────────────────────────────────
// ("use server" 파일에서 타입 재export 시 turbopack 런타임 에러 — 여기서 자체 정의)

export type PortalTimetableEntry = {
  id: string;
  dayOfWeek: number; // 1=월 … 6=토, 0=일
  startTime: string; // "HH:MM"
  endTime: string;
  subject: string;
  details: string | null;
  colorCode: string;
  allDay: boolean;
};

export type PortalCalendarEvent = {
  id: string;
  title: string;
  type: string;
  startDate: string; // ISO
  endDate: string | null;
  allDay: boolean;
};

export type PortalPlanItem = {
  id: string;
  text: string;
  done: boolean;
  colorCode: string;
  duration?: number;
};

export type PortalDailyPlan = {
  date: string; // "YYYY-MM-DD"
  items: PortalPlanItem[];
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

// ── 조회 (서버 페이지에서 호출) ─────────────────────────────────────────

/** 학생 본인의 이번 주 시간표 + 캘린더 일정. */
export async function getMyWeekSchedule(token: string): Promise<{
  weekStart: string; // 월요일 "YYYY-MM-DD"
  timetable: PortalTimetableEntry[];
  events: PortalCalendarEvent[];
}> {
  const session = await validateMagicLink(token);
  if (!session) throw new Error("인증이 만료되었습니다");

  const monday = weekStartKST();
  const weekEnd = addDays(monday, 7);
  const schoolName = session.student.school ? parseSchool(session.student.school) : null;

  const [timetable, events] = await Promise.all([
    prisma.timetableEntry.findMany({
      where: { studentId: session.student.id },
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
              { studentId: session.student.id },
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
export async function getMyDailyPlans(token: string): Promise<{
  today: PortalDailyPlan;
  tomorrow: PortalDailyPlan;
}> {
  const session = await validateMagicLink(token);
  if (!session) throw new Error("인증이 만료되었습니다");

  const today = todayKST();
  const tomorrow = addDays(today, 1);

  const plans = await prisma.dailyPlan.findMany({
    where: { studentId: session.student.id, date: { in: [today, tomorrow] } },
    select: { date: true, items: true },
  });

  const pick = (d: Date): PortalDailyPlan => {
    const row = plans.find((p) => p.date.getTime() === d.getTime());
    return {
      date: isoDate(d),
      items: ((row?.items as PortalPlanItem[]) ?? []).filter(Boolean),
    };
  };

  return { today: pick(today), tomorrow: pick(tomorrow) };
}

// ── 저장 (클라이언트에서 호출) ──────────────────────────────────────────

function sanitizeItems(items: PortalPlanItem[]): PortalPlanItem[] {
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

/** 학생 본인의 오늘/내일 공부 계획 저장 (항목 전체 교체, 메모는 보존). */
export async function saveMyDailyPlan(params: {
  token: string;
  date: string; // "YYYY-MM-DD" — 오늘 또는 내일만 허용
  items: PortalPlanItem[];
}) {
  const session = await validateMagicLink(params.token);
  if (!session) throw new Error("인증이 만료되었습니다");

  const today = todayKST();
  const allowed = [isoDate(today), isoDate(addDays(today, 1))];
  if (!allowed.includes(params.date)) {
    throw new Error("오늘 또는 내일 계획만 수정할 수 있습니다");
  }

  const date = new Date(params.date);
  const items = sanitizeItems(params.items);

  await prisma.dailyPlan.upsert({
    where: { studentId_date: { studentId: session.student.id, date } },
    create: { studentId: session.student.id, date, items },
    update: { items },
  });

  revalidatePath("/timetable");
  return { ok: true };
}
