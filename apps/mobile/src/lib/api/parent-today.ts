// 학부모 — 오늘 · 출결 달력 · 공부 시간 · 자녀 연결 API 타입과 경로.
// 서버: src/lib/mobile-parent-attendance.ts, src/lib/mobile-parent-links.ts

import { mutateMobileApi } from '@/lib/mobile-api';

export type ParentAttendanceType =
  | 'NORMAL'
  | 'ABSENT'
  | 'TARDY'
  | 'EARLY_LEAVE'
  | 'APPROVED_ABSENT'
  | 'NOTIFIED_ABSENT';

export type ParentDayStatus = '입실' | '외출' | '퇴실' | '미입실' | '결석';

export type ParentOuting = {
  sequence: number;
  reason: string | null;
  /** 아직 나가지 않은 예정 외출 (오늘만) */
  planned: boolean;
  /** ISO */
  start: string | null;
  end: string | null;
  /** "HH:MM" (요일별 외출 일정) */
  expectedStart: string | null;
  expectedEnd: string | null;
  status: '예정' | '외출중' | '복귀';
};

export type ParentDay = {
  /** YYYY-MM-DD (KST) */
  date: string;
  weekday: number;
  status: ParentDayStatus;
  type: ParentAttendanceType | null;
  /** 지각 · 조퇴 · 결석 · 허가 결석 · 사전 연락 결석 */
  typeLabel: string | null;
  isLate: boolean;
  lateMinutes: number | null;
  scheduled: boolean;
  expected: { start: string | null; end: string | null; flexible: boolean };
  checkIn: string | null;
  checkOut: string | null;
  studyMinutes: number;
  outings: ParentOuting[];
};

export type ParentTodayResponse = ParentDay & {
  child: { id: string; name: string; grade: string; seat: string | null };
  now: string;
  /** 입실 예정 30분이 지났는데 아직 입실 전 */
  overdue: boolean;
  naps: { id: string; startTime: string; durationMin: number }[];
  phoneCheck: {
    status: 'SUBMITTED' | 'NOT_SUBMITTED' | 'ABSENT' | 'EXEMPT';
    label: string;
    checkedAt: string;
  } | null;
  notice: {
    id: string;
    title: string;
    content: string;
    createdAt: string;
    updatedAt: string;
  } | null;
};

export type ParentAttendanceMonthResponse = {
  month: string;
  today: string;
  /** 등록 월 (이전 달로는 못 넘어감) */
  firstMonth: string | null;
  scheduleWeekdays: number[];
  summary: {
    present: number;
    late: number;
    absent: number;
    earlyLeave: number;
    outings: number;
    studyMinutes: number;
  };
  /** 기록이 있는 날만 (최신순) */
  items: ParentDay[];
};

export type StudyRange = 'week' | 'month';

export type ParentStudyStatsResponse = {
  range: StudyRange;
  start: string;
  end: string;
  today: string;
  inProgress: boolean;
  days: {
    date: string;
    weekday: number;
    minutes: number;
    attended: boolean;
    future: boolean;
    today: boolean;
  }[];
  totalMinutes: number;
  attendedDays: number;
  dailyAverageMinutes: number;
  previous: {
    start: string;
    end: string;
    totalMinutes: number;
    /** 진행 중인 기간이면 지난 기간의 같은 시점까지 합계 */
    comparableMinutes: number;
  };
  /** 같은 학년(이 기간 등원 학생) 평균 — 인원이 적으면 null */
  gradeAverage: { totalMinutes: number; dailyMinutes: number; cohortSize: number } | null;
};

export type ParentLinkPreview = {
  expiresAt: string;
  relation: string | null;
  children: { id: string; name: string; grade: string; seat: string | null; alreadyLinked: boolean }[];
};

export type ParentLinkResult = {
  added: { id: string; name: string; grade: string; seat: string | null }[];
};

export const parentApi = {
  today: (studentId: string) =>
    `/api/mobile/v1/parent/today?studentId=${encodeURIComponent(studentId)}`,
  attendance: (studentId: string, month: string) =>
    `/api/mobile/v1/parent/attendance?studentId=${encodeURIComponent(studentId)}&month=${month}`,
  studyStats: (studentId: string, range: StudyRange, date?: string) =>
    `/api/mobile/v1/parent/study-stats?studentId=${encodeURIComponent(studentId)}&range=${range}${
      date ? `&date=${date}` : ''
    }`,
  linkPreview: (inviteToken: string) =>
    `/api/mobile/v1/parent/links?inviteToken=${encodeURIComponent(inviteToken)}`,
};

export function redeemParentInvite(inviteToken: string) {
  return mutateMobileApi<ParentLinkResult>('/api/mobile/v1/parent/links', 'POST', { inviteToken });
}

/** 초대 링크(…/sign-up?token=…) 또는 코드 → 토큰 */
export function extractInviteToken(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.includes('://')) {
    try {
      return new URL(trimmed).searchParams.get('token')?.trim() ?? '';
    } catch {
      return '';
    }
  }
  const m = /(?:^|[?&])token=([^&\s]+)/.exec(trimmed);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }
  return trimmed;
}
