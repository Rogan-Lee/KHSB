// 직원 현장 운영(입퇴실·학생 프로필·상벌점·휴대폰 제출·좌석 현황) — 응답 타입과 클라이언트 함수.
// 서버: src/lib/mobile-data.ts · mobile-staff-ops*.ts, 라우트 /api/mobile/v1/staff/*

import {
  mutateMobileApi,
  type StaffAttendanceItem,
  type StaffAttendanceResponse,
  type StaffStudentDetail,
} from '@/lib/mobile-api';

// ─── 입퇴실 ─────────────────────────────────────────────────────────

export type AttendanceStatus = StaffAttendanceItem['status'];

export type AttendanceTypeCode =
  'NORMAL' | 'ABSENT' | 'TARDY' | 'EARLY_LEAVE' | 'APPROVED_ABSENT' | 'NOTIFIED_ABSENT';

export type OpsAttention = {
  severity: 'high' | 'medium' | 'low';
  manual: boolean;
  reasons: string[];
};

/** GET /staff/attendance 항목 (기존 필드 + 확장) */
export type OpsAttendanceItem = StaffAttendanceItem & {
  attendanceType: AttendanceTypeCode | null;
  attention: OpsAttention | null;
  dailyNote: string | null;
  parentPhone: string | null;
  phone: string | null;
  school: string | null;
  unreadRequests: number;
};

export type OpsAttendanceResponse = Omit<StaffAttendanceResponse, 'items' | 'summary'> & {
  items: OpsAttendanceItem[];
  summary: StaffAttendanceResponse['summary'] & {
    checkedOut: number;
    inRoom: number;
    notArrived: number;
    unreadRequests: number;
  };
};

export type AttendanceAction =
  | 'CHECK_IN'
  | 'CHECK_OUT'
  | 'START_OUTING'
  | 'RETURN'
  | 'MARK_ABSENT'
  | 'SET_TIMES'
  | 'ADD_OUTING'
  | 'EDIT_OUTING'
  | 'DELETE_OUTING';

export type AttendancePatch = {
  action: AttendanceAction;
  checkIn?: string | null;
  checkOut?: string | null;
  type?: Exclude<AttendanceTypeCode, 'EARLY_LEAVE'>;
  notes?: string | null;
  outStart?: string | null;
  outEnd?: string | null;
  reason?: string | null;
  outingId?: string;
};

export function patchAttendance(studentId: string, body: AttendancePatch) {
  return mutateMobileApi<{ ok: true }>(`/api/mobile/v1/staff/attendance/${studentId}`, 'PATCH', body);
}

// ─── 학생 검색 ──────────────────────────────────────────────────────

export type OpsStudentsResponse = { items: OpsAttendanceItem[] };

// ─── 상벌점 ─────────────────────────────────────────────────────────

export type MeritType = 'MERIT' | 'DEMERIT';

export type MeritItem = {
  id: string;
  date: string;
  type: MeritType;
  points: number;
  reason: string;
  category: string | null;
  visibleInReport: boolean;
  createdAt: string;
  createdByName: string | null;
  mine: boolean;
};

export type MeritTotals = {
  month: { merit: number; demerit: number };
  total: { merit: number; demerit: number };
};

export type OpsMeritsResponse = {
  categories: string[];
  items: MeritItem[];
  recentReasons: Record<MeritType, string[]>;
  summary: MeritTotals | null;
};

export type MeritInput = {
  studentId: string;
  type: MeritType;
  points: number;
  reason: string;
  category?: string | null;
  date?: string;
};

export function createMerit(input: MeritInput) {
  return mutateMobileApi<{ item: MeritItem; studentId: string }>(
    '/api/mobile/v1/staff/merits',
    'POST',
    input
  );
}

export function deleteMerit(meritId: string) {
  return mutateMobileApi<{ ok: true; studentId: string }>(`/api/mobile/v1/staff/merits/${meritId}`, 'DELETE');
}

// ─── 학부모 요청 · 운영진 전달 ───────────────────────────────────────

export type CommunicationType = 'PARENT_REQUEST' | 'STAFF_NOTE';

export type CommunicationItem = {
  id: string;
  type: CommunicationType;
  typeLabel: string;
  content: string;
  isChecked: boolean;
  checkedAt: string | null;
  createdAt: string;
  createdByName: string;
};

export function createCommunication(studentId: string, body: { type: CommunicationType; content: string }) {
  return mutateMobileApi<{ item: CommunicationItem }>(
    `/api/mobile/v1/staff/student/${studentId}/communications`,
    'POST',
    body
  );
}

export function checkCommunication(studentId: string, communicationId: string) {
  return mutateMobileApi<{ item: CommunicationItem }>(
    `/api/mobile/v1/staff/student/${studentId}/communications/${communicationId}`,
    'PATCH',
    { isChecked: true }
  );
}

// ─── 학생 프로필 (GET /staff/student/[id]) ───────────────────────────

export type ExamTypeCode = 'OFFICIAL_MOCK' | 'PRIVATE_MOCK' | 'SCHOOL_EXAM' | 'DUFF';

export type AttendanceDay = {
  date: string;
  weekday: number;
  isToday: boolean;
  scheduled: boolean;
  scheduleStart: string | null;
  scheduleEnd: string | null;
  record: {
    type: AttendanceTypeCode;
    typeLabel: string;
    checkIn: string | null;
    checkOut: string | null;
    notes: string | null;
  } | null;
};

export type OpsStudentProfile = Omit<StaffStudentDetail, 'info' | 'scores'> & {
  info: StaffStudentDetail['info'] & { mentorName: string | null };
  scores: (Omit<StaffStudentDetail['scores'][number], 'examType'> & { examType: ExamTypeCode })[];
  today: OpsAttendanceItem | null;
  attention: OpsAttention | null;
  attendance14: {
    days: AttendanceDay[];
    summary: { normal: number; tardy: number; absent: number; excused: number };
  };
  merits: MeritTotals & { recent: MeritItem[] };
  communications: { items: CommunicationItem[]; unchecked: number };
  mentorings: {
    id: string;
    scheduledAt: string;
    status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'RESCHEDULED';
    statusLabel: string;
    mentorName: string;
    summary: string | null;
  }[];
};

export const studentProfilePath = (id: string) => `/api/mobile/v1/staff/student/${id}`;

// ─── 휴대폰 제출 ────────────────────────────────────────────────────

export type PhoneCheckStatus = 'SUBMITTED' | 'NOT_SUBMITTED' | 'ABSENT' | 'EXEMPT';

export type PhoneCheckRow = {
  studentId: string;
  name: string;
  seat: string | null;
  grade: string;
  checkedIn: boolean;
  checkInAt: string | null;
  record: { status: PhoneCheckStatus; note: string | null } | null;
};

export type PhoneCheckResponse = { date: string; isToday: boolean; rows: PhoneCheckRow[] };

export function setPhoneCheck(
  studentId: string,
  body: { date: string; status: PhoneCheckStatus; note?: string | null }
) {
  return mutateMobileApi<{ ok: true; record: { status: PhoneCheckStatus; note: string | null } }>(
    `/api/mobile/v1/staff/phone-check/${studentId}`,
    'PUT',
    body
  );
}

export function bulkPhoneSubmitted(body: { date: string; studentIds: string[] }) {
  return mutateMobileApi<{ count: number }>('/api/mobile/v1/staff/phone-check/bulk', 'POST', body);
}

// ─── 좌석 현황 ──────────────────────────────────────────────────────

export type SeatLayoutCell = number | null;

export type SeatLayoutBottomItem =
  { kind: 'facility'; label: string; flex: number } | { kind: 'seat'; seat: number } | { kind: 'aisle' };

export type SeatLayoutRoom = {
  key: 'K' | 'H';
  label: string;
  colHeight: number;
  blocks: SeatLayoutCell[][][];
  bottom: SeatLayoutBottomItem[];
  overlay: { label: string; row: number; span: number } | null;
};

export type SeatMapResponse = {
  date: string;
  rooms: SeatLayoutRoom[];
  items: OpsAttendanceItem[];
  summary: OpsAttendanceResponse['summary'];
};
