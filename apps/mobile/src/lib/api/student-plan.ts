import type { Tone } from '@/design';
import { mutateMobileApi } from '@/lib/mobile-api';

// 학생 내 일정 · 등원 스케줄 · 모의고사 신청 — 서버 src/lib/mobile-student-plan.ts
//  GET  /api/mobile/v1/student/schedule                    내 일정 + 등원 스케줄
//  PUT  /api/mobile/v1/student/schedule/plans              오늘/내일 공부 계획 저장
//  POST /api/mobile/v1/student/schedule/proposals          등원 스케줄 제출
//  GET  /api/mobile/v1/student/exam-applications           모의고사 목록
//  POST|DELETE /api/mobile/v1/student/exam-applications/:id 신청 · 취소

export const STUDENT_SCHEDULE_PATH = '/api/mobile/v1/student/schedule';
export const STUDENT_EXAMS_PATH = '/api/mobile/v1/student/exam-applications';

// ── 내 일정 ─────────────────────────────────────────────────────────────

export type TimetableEntry = {
  id: string;
  /** 1=월 … 6=토, 0=일 */
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  subject: string;
  details: string | null;
  colorCode: string;
  allDay: boolean;
};

export type CalendarEvent = {
  id: string;
  title: string;
  type: string;
  startDate: string;
  endDate: string | null;
  allDay: boolean;
};

export type PlanItem = {
  id: string;
  text: string;
  done: boolean;
  colorCode: string;
  duration?: number;
};

export type DailyPlan = { date: string; items: PlanItem[] };

// ── 등원 스케줄 ─────────────────────────────────────────────────────────

export type AttendanceSlot = { dayOfWeek: number; startTime: string; endTime: string };
export type OutingSlot = { dayOfWeek: number; outStart: string; outEnd: string; reason?: string | null };
export type ScheduleSlots = { attendance: AttendanceSlot[]; outings: OutingSlot[] };

export type ScheduleProposalStatus =
  | 'SUBMITTED'
  | 'PROPOSED'
  | 'APPROVED'
  | 'REJECTED'
  | 'COMMITTED'
  | 'SUPERSEDED'
  | 'CANCELLED';

export type ScheduleProposal = {
  id: string;
  version: number;
  status: ScheduleProposalStatus;
  createdAt: string;
  committedAt: string | null;
  /** 적용 예정일 YYYY-MM-DD (운영진이 학부모에게 보낼 때 지정) */
  scheduledFor: string | null;
  memo: string | null;
  submitted: ScheduleSlots;
  /** 학부모에게 보낸 최종안 (PROPOSED 이후) */
  final: ScheduleSlots | null;
};

export type StudentScheduleResponse = {
  todayStr: string;
  /** 이번 주 월요일 YYYY-MM-DD */
  weekStart: string;
  timetable: TimetableEntry[];
  events: CalendarEvent[];
  plans: { today: DailyPlan; tomorrow: DailyPlan };
  current: ScheduleSlots;
  proposals: ScheduleProposal[];
};

/** 웹 src/components/portal/status.ts SCHEDULE_PROPOSAL_STATUS 와 동일 */
export const SCHEDULE_PROPOSAL_STATUS: Record<ScheduleProposalStatus, { label: string; tone: Tone }> = {
  SUBMITTED: { label: '검토 대기', tone: 'gray' },
  PROPOSED: { label: '학부모 승인 대기', tone: 'warn' },
  APPROVED: { label: '승인됨', tone: 'info' },
  REJECTED: { label: '반려됨', tone: 'bad' },
  COMMITTED: { label: '반영 완료', tone: 'ok' },
  SUPERSEDED: { label: '대체됨', tone: 'gray' },
  CANCELLED: { label: '취소됨', tone: 'gray' },
};

export function saveStudentPlan(date: string, items: PlanItem[]) {
  return mutateMobileApi<{ ok: boolean }>(`${STUDENT_SCHEDULE_PATH}/plans`, 'PUT', { date, items });
}

export function submitStudentSchedule(body: {
  attendance: AttendanceSlot[];
  outings: OutingSlot[];
  memo: string;
}) {
  return mutateMobileApi<{ id: string; version: number }>(
    `${STUDENT_SCHEDULE_PATH}/proposals`,
    'POST',
    body,
  );
}

// ── 모의고사 ────────────────────────────────────────────────────────────

export type ExamApplyStatus = 'NONE' | 'PENDING' | 'CONFIRMED' | 'CANCELLED';

export type StudentExamSession = {
  sessionId: string;
  title: string;
  /** YYYY-MM-DD */
  examDate: string;
  examTypeLabel: string;
  subjects: string[];
  notes: string | null;
  /** 신청 접수 중인지 (닫힌 시험은 내가 신청·배정된 것만 내려옴) */
  applicationOpen: boolean;
  myStatus: ExamApplyStatus;
  myMemo: string;
  seatNumber: number | null;
};

export type StudentExamsResponse = { sessions: StudentExamSession[] };

export function applyStudentExam(sessionId: string, memo: string) {
  return mutateMobileApi<{ ok: boolean }>(
    `${STUDENT_EXAMS_PATH}/${encodeURIComponent(sessionId)}`,
    'POST',
    { memo: memo || null },
  );
}

export function cancelStudentExam(sessionId: string) {
  return mutateMobileApi<{ ok: boolean }>(
    `${STUDENT_EXAMS_PATH}/${encodeURIComponent(sessionId)}`,
    'DELETE',
  );
}
