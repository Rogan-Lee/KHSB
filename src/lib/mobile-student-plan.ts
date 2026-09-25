import { z } from "zod";

import { EXAM_TYPE_LABELS } from "@/components/exams/exam-type-label";
import {
  cancelExamApplicationForStudent,
  submitExamApplicationForStudent,
} from "@/lib/exam-application-core";
import {
  loadExamApplicationSessionsForStudent,
  type ExamApplicationSession,
  type ExamApplyStatus,
} from "@/lib/exam-application-data";
import { MobileApiError } from "@/lib/mobile-auth";
import { sanitizeAttendance, sanitizeOutings } from "@/lib/online/schedule-commit";
import { submitScheduleProposalForStudent } from "@/lib/online/schedule-student-core";
import { prisma } from "@/lib/prisma";
import {
  getDailyPlansForStudent,
  getWeekScheduleForStudent,
  saveDailyPlanForStudent,
} from "@/lib/student-schedule-core";
import { todayKST } from "@/lib/utils";

// 학생 앱 — 내 일정(시간표·일정·공부 계획) · 등원 스케줄 제출 · 모의고사 신청.
// 웹 학생 포털 /s/[token]/schedule, /s/[token]/exam 과 같은 규칙: 학생 ID 기준 코어
// (student-schedule-core, online/schedule-student-core, exam-application-core)를 웹 액션과 공용으로 쓴다.

type StudentRef = { id: string; name: string; school: string | null };

function parseBody<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new MobileApiError(result.error.issues[0]?.message ?? "입력값을 확인해 주세요", 400);
}

// ── 내 일정 + 등원 스케줄 ────────────────────────────────────────────────

const HISTORY_LIMIT = 30;

export async function getMobileStudentSchedule(student: StudentRef) {
  const [week, plans, attendance, outings, proposals] = await Promise.all([
    getWeekScheduleForStudent(student),
    getDailyPlansForStudent(student.id),
    prisma.attendanceSchedule.findMany({
      where: { studentId: student.id },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      select: { dayOfWeek: true, startTime: true, endTime: true },
    }),
    prisma.outingSchedule.findMany({
      where: { studentId: student.id },
      orderBy: [{ dayOfWeek: "asc" }, { outStart: "asc" }],
      select: { dayOfWeek: true, outStart: true, outEnd: true, reason: true },
    }),
    prisma.scheduleProposal.findMany({
      where: { studentId: student.id },
      orderBy: { version: "desc" },
      take: HISTORY_LIMIT,
      select: {
        id: true,
        version: true,
        status: true,
        createdAt: true,
        committedAt: true,
        scheduledFor: true,
        studentMemo: true,
        submittedAttendance: true,
        submittedOutings: true,
        proposedAttendance: true,
        proposedOutings: true,
      },
    }),
  ]);

  return {
    todayStr: todayKST().toISOString().slice(0, 10),
    weekStart: week.weekStart,
    timetable: week.timetable,
    events: week.events,
    plans,
    /** 지금 입퇴실에 적용 중인 등원 스케줄 */
    current: {
      attendance: sanitizeAttendance(attendance),
      outings: sanitizeOutings(outings),
    },
    /** 제출 이력 (최신 버전 먼저) */
    proposals: proposals.map((p) => {
      const submitted = {
        attendance: sanitizeAttendance(p.submittedAttendance),
        outings: sanitizeOutings(p.submittedOutings),
      };
      // 운영진이 학부모에게 보낸 뒤(PROPOSED 이후)에는 최종안을 같이 보여 준다
      const shared = ["PROPOSED", "APPROVED", "COMMITTED", "SUPERSEDED"].includes(p.status);
      return {
        id: p.id,
        version: p.version,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
        committedAt: p.committedAt?.toISOString() ?? null,
        scheduledFor: p.scheduledFor ? p.scheduledFor.toISOString().slice(0, 10) : null,
        memo: p.studentMemo,
        submitted,
        final: shared
          ? {
              attendance: sanitizeAttendance(p.proposedAttendance),
              outings: sanitizeOutings(p.proposedOutings),
            }
          : null,
      };
    }),
  };
}

// 대시보드 시간표(day-view)가 만든 항목도 같은 목록에 섞여 있다(빈 text, nanoid id 등) —
// 토글·삭제 때 목록 전체를 다시 보내므로 형식만 느슨하게 검사하고, 길이 자르기는 코어(sanitizeItems)에 맡긴다.
const planItemSchema = z.object({
  id: z.string().max(100),
  text: z.string().max(2000, "계획이 너무 길어요"),
  done: z.boolean(),
  colorCode: z.string().max(50).optional(),
  duration: z.number().nullable().optional(),
});

const planSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 확인해 주세요"),
  items: z.array(planItemSchema).max(50, "계획은 50개까지 추가할 수 있어요"),
});

export async function saveMobileStudentPlan(studentId: string, input: unknown) {
  const body = parseBody(planSchema, input);
  return saveDailyPlanForStudent(
    studentId,
    body.date,
    body.items.map(({ duration, ...it }) => ({
      ...it,
      colorCode: it.colorCode ?? "blue",
      ...(typeof duration === "number" ? { duration } : {}),
    })),
  );
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const time = (msg: string) => z.string().regex(HHMM, msg);
const day = z.number().int().min(0).max(6);

const proposalSchema = z.object({
  attendance: z
    .array(
      z
        .object({
          dayOfWeek: day,
          startTime: time("등원 시간을 확인해 주세요"),
          endTime: time("하원 시간을 확인해 주세요"),
        })
        .refine((s) => s.endTime > s.startTime, "하원 시간은 등원 시간보다 늦어야 해요"),
    )
    .min(1, "등하원 요일을 1개 이상 선택해 주세요")
    .max(7)
    .refine(
      (rows) => new Set(rows.map((r) => r.dayOfWeek)).size === rows.length,
      "같은 요일이 두 번 들어갔어요",
    ),
  outings: z
    .array(
      z
        .object({
          dayOfWeek: day,
          outStart: time("외출 시간을 확인해 주세요"),
          outEnd: time("복귀 시간을 확인해 주세요"),
          reason: z.string().trim().max(100, "외출 사유는 100자까지 쓸 수 있어요").nullable().optional(),
        })
        .refine((o) => o.outEnd > o.outStart, "복귀 시간은 외출 시간보다 늦어야 해요"),
    )
    .max(20, "외출 일정은 20개까지 넣을 수 있어요"),
  memo: z.string().max(1000, "메모는 1000자까지 쓸 수 있어요").nullable().optional(),
});

export async function submitMobileStudentScheduleProposal(studentId: string, input: unknown) {
  const body = parseBody(proposalSchema, input);
  return submitScheduleProposalForStudent(studentId, {
    attendance: body.attendance,
    outings: body.outings.map((o) => ({ ...o, reason: o.reason || null })),
    memo: body.memo ?? null,
  });
}

// ── 모의고사 신청 ────────────────────────────────────────────────────────

const VIA_APP = " (학생 앱)";

export type StudentExamSession = ExamApplicationSession & {
  applicationOpen: boolean;
  seatNumber: number | null;
};

/**
 * 접수 중인 모의고사 + 본인 신청 상태 (웹과 동일) — 여기에 더해 접수는 닫혔지만
 * 본인이 신청했거나 좌석을 받은 다가오는 시험도 내려준다(확정·좌석 번호 확인용).
 */
export async function getMobileStudentExams(studentId: string) {
  const today = todayKST();
  const open = await loadExamApplicationSessionsForStudent(studentId);
  const openIds = open.map((s) => s.sessionId);

  const [mine, seats] = await Promise.all([
    prisma.examSession.findMany({
      where: {
        id: { notIn: openIds },
        examDate: { gte: today },
        OR: [
          { applications: { some: { studentId } } },
          { assignments: { some: { studentId } } },
        ],
      },
      orderBy: { examDate: "asc" },
      include: {
        applications: { where: { studentId }, select: { status: true, memo: true } },
      },
    }),
    prisma.examSeatAssignment.findMany({
      where: { studentId, session: { examDate: { gte: today } } },
      select: { sessionId: true, seatNumber: true },
    }),
  ]);
  const seatOf = new Map(seats.map((s) => [s.sessionId, s.seatNumber]));

  const sessions: StudentExamSession[] = [
    ...open.map((s) => ({
      ...s,
      applicationOpen: true,
      seatNumber: seatOf.get(s.sessionId) ?? null,
    })),
    ...mine.map((s) => {
      const app = s.applications[0];
      return {
        sessionId: s.id,
        title: s.title,
        examDate: s.examDate.toISOString().slice(0, 10),
        examTypeLabel: EXAM_TYPE_LABELS[s.examType],
        subjects: s.subjects,
        notes: s.notes,
        applicationOpen: false,
        // 좌석만 받고 신청 기록이 없으면(운영진 직접 배정) 확정으로 본다
        myStatus: (app?.status ?? (seatOf.has(s.id) ? "CONFIRMED" : "NONE")) as ExamApplyStatus,
        myMemo: app?.memo ?? "",
        seatNumber: seatOf.get(s.id) ?? null,
      };
    }),
  ].sort((a, b) => a.examDate.localeCompare(b.examDate));

  return { sessions };
}

const applySchema = z.object({
  memo: z.string().max(300, "요청사항은 300자까지 쓸 수 있어요").nullable().optional(),
});

export async function applyMobileStudentExam(
  student: { id: string; name: string },
  sessionId: string,
  input: unknown,
) {
  const body = parseBody(applySchema, input ?? {});
  return submitExamApplicationForStudent(student, sessionId, body.memo ?? undefined, VIA_APP);
}

export async function cancelMobileStudentExam(studentId: string, sessionId: string) {
  const app = await prisma.examApplication.findUnique({
    where: { sessionId_studentId: { sessionId, studentId } },
    select: { status: true },
  });
  if (!app) return { ok: true };
  // 웹 포털과 같이 확정된 신청은 직접 취소하지 않는다 (좌석 배정과 얽혀 있음)
  if (app.status === "CONFIRMED") {
    throw new MobileApiError("확정된 신청은 운영진에게 문의해 취소해 주세요", 409);
  }
  return cancelExamApplicationForStudent(studentId, sessionId);
}
