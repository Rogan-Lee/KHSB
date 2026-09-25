"use server";

import { validateMagicLink } from "@/lib/student-auth";
import {
  getDailyPlansForStudent,
  getWeekScheduleForStudent,
  saveDailyPlanForStudent,
  type StudentCalendarEvent,
  type StudentDailyPlan,
  type StudentPlanItem,
  type StudentTimetableEntry,
} from "@/lib/student-schedule-core";

// 핵심 로직은 src/lib/student-schedule-core.ts (학생 앱과 공용). 여기서는 매직링크 토큰 인증만.

// ── 타입 ────────────────────────────────────────────────────────────────
// ("use server" 파일에서 `export type { … } from` 재export 시 turbopack 런타임 에러 — 별칭으로 정의)

export type PortalTimetableEntry = StudentTimetableEntry;
export type PortalCalendarEvent = StudentCalendarEvent;
export type PortalPlanItem = StudentPlanItem;
export type PortalDailyPlan = StudentDailyPlan;

// ── 조회 (서버 페이지에서 호출) ─────────────────────────────────────────

/** 학생 본인의 이번 주 시간표 + 캘린더 일정. */
export async function getMyWeekSchedule(token: string): Promise<{
  weekStart: string; // 월요일 "YYYY-MM-DD"
  timetable: PortalTimetableEntry[];
  events: PortalCalendarEvent[];
}> {
  const session = await validateMagicLink(token);
  if (!session) throw new Error("인증이 만료되었습니다");
  return getWeekScheduleForStudent(session.student);
}

/** 오늘·내일 공부 계획 (DailyPlan). 없으면 빈 항목. */
export async function getMyDailyPlans(token: string): Promise<{
  today: PortalDailyPlan;
  tomorrow: PortalDailyPlan;
}> {
  const session = await validateMagicLink(token);
  if (!session) throw new Error("인증이 만료되었습니다");
  return getDailyPlansForStudent(session.student.id);
}

// ── 저장 (클라이언트에서 호출) ──────────────────────────────────────────

/** 학생 본인의 오늘/내일 공부 계획 저장 (항목 전체 교체, 메모는 보존). */
export async function saveMyDailyPlan(params: {
  token: string;
  date: string; // "YYYY-MM-DD" — 오늘 또는 내일만 허용
  items: PortalPlanItem[];
}) {
  const session = await validateMagicLink(params.token);
  if (!session) throw new Error("인증이 만료되었습니다");
  return saveDailyPlanForStudent(session.student.id, params.date, params.items);
}
