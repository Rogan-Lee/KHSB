// 직원 홈·전체·일정·공지·단체 알림·점심·근무/순찰/인수인계 — 응답 타입과 호출 함수 (T4 영역).
// 서버: src/lib/mobile-staff-home.ts · mobile-staff-lunch.ts · mobile-staff-notices.ts · mobile-operations.ts

import { mutateMobileApi, type StaffHandoversResponse } from '@/lib/mobile-api';

export type {
  PatrolStudent,
  StaffOperationsResponse,
  StaffPatrolResponse,
  WorkTagView,
} from '@/lib/mobile-api';

export const STAFF_API = {
  today: '/api/mobile/v1/staff/today',
  calendar: (from: string, to: string) => `/api/mobile/v1/staff/calendar?from=${from}&to=${to}`,
  todo: (id: string) => `/api/mobile/v1/staff/todos/${id}`,
  lunch: (date: string) => `/api/mobile/v1/staff/lunch?date=${date}`,
  lunchItem: (id: string) => `/api/mobile/v1/staff/lunch/items/${id}`,
  lunchRequest: (id: string) => `/api/mobile/v1/staff/lunch/requests/${id}`,
  announcements: (page: AnnouncementPage) => `/api/mobile/v1/staff/announcements?page=${page}`,
  announcement: (id: string) => `/api/mobile/v1/staff/announcements/${id}`,
  broadcast: '/api/mobile/v1/staff/broadcast',
  operations: '/api/mobile/v1/staff/operations',
  patrol: '/api/mobile/v1/staff/patrol',
  patrolRecords: (roundId: string) => `/api/mobile/v1/staff/patrol/${roundId}/records`,
  handovers: '/api/mobile/v1/staff/handovers',
  handoverRead: (id: string) => `/api/mobile/v1/staff/handovers/${id}/read`,
  handoverItem: (id: string) => `/api/mobile/v1/staff/handovers/items/${id}`,
} as const;

// ─── 홈 (오늘) ─────────────────────────────────────────────────────

export type CalendarEventType = 'SCHOOL_EXAM' | 'SCHOOL_EVENT' | 'PERSONAL' | 'PLATFORM';

export type CalendarEventView = {
  id: string;
  title: string;
  description: string | null;
  type: CalendarEventType;
  typeLabel: string;
  /** 웹 캘린더 색 이름 (red, blue …) */
  color: string | null;
  allDay: boolean;
  /** KST YYYY-MM-DD */
  startDate: string;
  endDate: string;
  /** KST HH:MM (종일이면 null) */
  startTime: string | null;
  endTime: string | null;
  schoolName: string | null;
  studentId: string | null;
  studentName: string | null;
};

export type MentorShift = {
  mentorId: string;
  name: string;
  timeStart: string;
  timeEnd: string;
  isMe: boolean;
};

export type StaffTodo = {
  id: string;
  title: string;
  priority: 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW' | string;
  dueDate: string | null;
  category: string | null;
  assignedBy: string | null;
};

export type AttentionItem = {
  studentId: string;
  name: string;
  grade: string;
  seat: string | null;
  severity: 'high' | 'medium' | 'low';
  isManual: boolean;
  reasons: string[];
};

export type OnlineSessionItem = {
  id: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  inProgress: boolean;
  meetUrl: string | null;
  studentId: string;
  studentName: string;
  grade: string;
};

/** null = 이 계정에 해당 없음(capabilities) 또는 불러오기 실패(failed 에 키가 들어감) */
export type StaffTodayResponse = {
  date: string;
  priorities: {
    approvals: number | null;
    openQuestions: number | null;
    mentoringRecords: number | null;
    lunchRequests: number | null;
    unreadHandovers: number | null;
    suggestions: number | null;
    tasksNeedFeedback: number | null;
    unreadMessages: number | null;
  };
  attendance: {
    present: number;
    away: number;
    notArrived: number;
    late: number;
    absent: number;
    total: number;
  } | null;
  mentoringToday: number | null;
  attention: { total: number; items: AttentionItem[] } | null;
  events: { total: number; items: CalendarEventView[] } | null;
  workingMentors: (MentorShift & { dayOfWeek: number })[] | null;
  todos: { total: number; items: StaffTodo[] } | null;
  patrol: {
    id: string;
    label: string | null;
    startedAt: string;
    patrollerName: string;
    checkedCount: number;
    rosterCount: number;
  } | null;
  sessions: OnlineSessionItem[] | null;
  failed: string[];
};

export function setTodoCompleted(id: string, completed: boolean) {
  return mutateMobileApi<{ id: string; isCompleted: boolean }>(STAFF_API.todo(id), 'PATCH', {
    completed,
  });
}

// ─── 일정 ──────────────────────────────────────────────────────────

export type StaffCalendarDay = {
  date: string;
  dayOfWeek: number;
  isToday: boolean;
  events: CalendarEventView[];
  mentors: MentorShift[];
};

export type StaffCalendarResponse = {
  from: string;
  to: string;
  today: string;
  days: StaffCalendarDay[];
};

// ─── 점심 ──────────────────────────────────────────────────────────

export type LunchPickupItem = {
  id: string;
  received: boolean;
  receivedAt: string | null;
  paid: boolean;
  depositClaimed: boolean;
  memo: string | null;
  studentId: string;
  studentName: string;
  grade: string;
  seat: string | null;
};

export type LunchChangeRequestItem = {
  id: string;
  message: string;
  reply: string | null;
  repliedByName: string | null;
  repliedAt: string | null;
  createdAt: string;
  studentName: string;
  grade: string;
  seat: string | null;
};

export type StaffLunchResponse = {
  date: string;
  isToday: boolean;
  prevDate: string | null;
  nextDate: string | null;
  menu: { id: string; name: string; price: number; closed: boolean } | null;
  items: LunchPickupItem[];
  summary: { total: number; received: number; paid: number; unpaid: number };
  requests: LunchChangeRequestItem[];
  openRequests: number;
};

export function setLunchReceived(itemId: string, received: boolean) {
  return mutateMobileApi<{ id: string; received: boolean }>(STAFF_API.lunchItem(itemId), 'PATCH', {
    received,
  });
}

export function replyLunchRequest(requestId: string, reply: string) {
  return mutateMobileApi<{ id: string }>(STAFF_API.lunchRequest(requestId), 'POST', { reply });
}

// ─── 공지 · 단체 알림 ──────────────────────────────────────────────

export type AnnouncementPage = 'mentoring' | 'monthly_notice' | 'monthly_recommendation';

export type AnnouncementItem = {
  id: string;
  title: string;
  content: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
};

export type StaffAnnouncementsResponse = {
  page: AnnouncementPage;
  label: string;
  history: boolean;
  canEdit: boolean;
  items: AnnouncementItem[];
  total: number;
  nextOffset: number | null;
};

export function createAnnouncement(page: AnnouncementPage, title: string, content: string) {
  return mutateMobileApi<AnnouncementItem>('/api/mobile/v1/staff/announcements', 'POST', {
    page,
    title,
    content,
  });
}

export function updateAnnouncement(id: string, title: string, content: string) {
  return mutateMobileApi<AnnouncementItem>(STAFF_API.announcement(id), 'PATCH', { title, content });
}

export function deleteAnnouncement(id: string) {
  return mutateMobileApi<{ ok: true }>(STAFF_API.announcement(id), 'DELETE');
}

export type BroadcastAudience = 'ALL' | 'STUDENTS' | 'PARENTS' | 'STAFF';

export type BroadcastTargetsResponse = { targets: Record<BroadcastAudience, number> };

export function sendBroadcast(audience: BroadcastAudience, title: string, body: string) {
  return mutateMobileApi<{ targets: number; sent: number }>(STAFF_API.broadcast, 'POST', {
    audience,
    title,
    body,
  });
}

// ─── 근무 · 순찰 · 인수인계 (기존 API) ─────────────────────────────

export type HandoverItem = StaffHandoversResponse['items'][number] & {
  /** 서버가 내려주는 "내가 쓴 인수인계" 표시 (구버전 서버면 undefined) */
  isMine?: boolean;
};

export type StaffHandoversListResponse = { items: HandoverItem[] };

export function clockWork(action: 'CLOCK_IN' | 'CLOCK_OUT', note: string) {
  return mutateMobileApi(STAFF_API.operations, 'POST', { action, note });
}

export function startPatrol() {
  return mutateMobileApi<{ id: string; reused: boolean }>(STAFF_API.patrol, 'POST', {
    action: 'START',
  });
}

export function endPatrol(roundId: string) {
  return mutateMobileApi(STAFF_API.patrol, 'POST', { action: 'END', roundId });
}

export type PatrolStatus = 'OK' | 'NOTE' | 'ABSENT';

export function savePatrolRecord(
  roundId: string,
  body: { studentId: string; status: PatrolStatus; note: string },
) {
  return mutateMobileApi(STAFF_API.patrolRecords(roundId), 'POST', body);
}

export function createHandover(body: {
  category: string;
  content: string;
  priority: 'URGENT' | 'NORMAL';
}) {
  return mutateMobileApi(STAFF_API.handovers, 'POST', body);
}

export function confirmHandover(id: string) {
  return mutateMobileApi(STAFF_API.handoverRead(id), 'POST', {});
}

export function toggleHandoverItem(itemId: string, kind: 'TASK' | 'CHECKLIST') {
  return mutateMobileApi(STAFF_API.handoverItem(itemId), 'PATCH', { kind });
}
