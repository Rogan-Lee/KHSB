import { mutateMobileApi } from '@/lib/mobile-api';

// 학부모 신청·소통 — 도시락 · 등원 스케줄 · 모의고사 신청 · 원장님께 문의 · 공지사항 · 전체 탭 요약.
// 서버: src/lib/mobile-parent-{services,lunch,schedule,exams,inquiries,notices}.ts
// 모든 자녀 단위 요청은 studentId 를 싣고, 서버가 ParentLink 로 검증한다.

const BASE = '/api/mobile/v1/parent';

const q = (studentId: string) => `?studentId=${encodeURIComponent(studentId)}`;

export const parentServicePaths = {
  summary: (studentId: string) => `${BASE}/services${q(studentId)}`,
  lunch: (studentId: string) => `${BASE}/lunch${q(studentId)}`,
  schedule: (studentId: string) => `${BASE}/schedule${q(studentId)}`,
  exams: (studentId: string) => `${BASE}/exam-applications${q(studentId)}`,
  inquiries: (studentId: string) => `${BASE}/inquiries${q(studentId)}`,
  notices: (studentId: string) => `${BASE}/notices${q(studentId)}`,
};

// ─── 전체 탭 요약 ───────────────────────────────────────────────────

/** closed 메뉴 없음 · open 신청 가능 · unpaid 입금 대기 · claimed 입금 확인 중 · confirmed 신청 확정 */
export type ParentLunchSummary = 'closed' | 'open' | 'unpaid' | 'claimed' | 'confirmed';

export type ParentServicesSummary = {
  lunch: ParentLunchSummary;
  schedule: { pendingProposal: boolean };
  exams: { openCount: number; appliedCount: number };
  inquiries: { waitingCount: number };
};

// ─── 도시락 ─────────────────────────────────────────────────────────

export type LunchMenu = { id: string; date: string; name: string; price: number; locked: boolean };
export type LunchOrderLine = { date: string; name: string; price: number };
export type LunchOrderState = { total: number; items: LunchOrderLine[]; depositClaimed: boolean };
export type LunchChangeThread = {
  id: string;
  message: string;
  reply: string | null;
  repliedByName: string | null;
  createdAt: string;
  repliedAt: string | null;
};

export type ParentLunchResponse = {
  studentName: string;
  menus: LunchMenu[];
  pendingMenuIds: string[];
  pendingMemo: string;
  paidMenuIds: string[];
  /** 입금 대기 중인 주문 */
  pending: LunchOrderState | null;
  /** 입금 확인 완료된 최신 주문 */
  confirmed: LunchOrderState | null;
  changeRequests: LunchChangeThread[];
  bankInfo: string | null;
  guideText: string | null;
};

export function saveLunchOrder(studentId: string, menuIds: string[], memo: string) {
  return mutateMobileApi<{ count: number }>(`${BASE}/lunch/order`, 'PUT', { studentId, menuIds, memo });
}

export function claimLunchDeposit(studentId: string) {
  return mutateMobileApi<{ ok: true }>(`${BASE}/lunch/deposit-claim`, 'POST', { studentId });
}

export function requestLunchChange(studentId: string, message: string) {
  return mutateMobileApi<{ ok: true }>(`${BASE}/lunch/change-requests`, 'POST', { studentId, message });
}

// ─── 등원 스케줄 ─────────────────────────────────────────────────────

export type AttendanceSlot = { dayOfWeek: number; startTime: string; endTime: string };
export type OutingSlot = { dayOfWeek: number; outStart: string; outEnd: string; reason?: string | null };

export type ScheduleProposalStatus =
  | 'SUBMITTED'
  | 'PROPOSED'
  | 'APPROVED'
  | 'REJECTED'
  | 'COMMITTED'
  | 'SUPERSEDED'
  | 'CANCELLED';

export type ScheduleProposalView = {
  id: string;
  version: number;
  status: ScheduleProposalStatus;
  attendance: AttendanceSlot[];
  outings: OutingSlot[];
  adminNote: string | null;
  /** 적용 시작일 YYYY-MM-DD */
  scheduledFor: string | null;
  approvedAt: string | null;
  committedAt: string | null;
  updatedAt: string;
  /** 내가 보낸 의견 (최신순) */
  feedbacks: { id: string; content: string; createdAt: string }[];
};

export type ParentScheduleResponse = {
  studentName: string;
  current: { attendance: AttendanceSlot[]; outings: OutingSlot[] };
  /** 승인 대기 제안 */
  pending: ScheduleProposalView | null;
  /** 최근 처리된 제안 (승인·반영·수정 요청) */
  latest: ScheduleProposalView | null;
};

export function approveSchedule(proposalId: string) {
  return mutateMobileApi<{ ok: true }>(`${BASE}/schedule/${proposalId}/approve`, 'POST', {});
}

export function rejectSchedule(proposalId: string, content: string) {
  return mutateMobileApi<{ ok: true; status: ScheduleProposalStatus }>(
    `${BASE}/schedule/${proposalId}/reject`,
    'POST',
    { content },
  );
}

// ─── 모의고사 신청 ───────────────────────────────────────────────────

export type ExamApplyStatus = 'NONE' | 'PENDING' | 'CONFIRMED' | 'CANCELLED';

export type ParentExamSession = {
  sessionId: string;
  title: string;
  examDate: string;
  examTypeLabel: string;
  subjects: string[];
  notes: string | null;
  applicationOpen: boolean;
  myStatus: ExamApplyStatus;
  myMemo: string;
  seatNumber: number | null;
};

export type ParentExamsResponse = { studentName: string; sessions: ParentExamSession[] };

export function applyExam(studentId: string, sessionId: string, memo: string) {
  return mutateMobileApi<{ ok: true }>(`${BASE}/exam-applications/${sessionId}`, 'POST', {
    studentId,
    memo,
  });
}

export function cancelExam(studentId: string, sessionId: string) {
  return mutateMobileApi<{ ok: true }>(`${BASE}/exam-applications/${sessionId}${q(studentId)}`, 'DELETE');
}

// ─── 원장님께 문의 ───────────────────────────────────────────────────

export type InquiryKind = 'CONSULT' | 'ATTENDANCE' | 'STUDY' | 'ETC';

export const INQUIRY_KIND_OPTIONS: { value: InquiryKind; label: string }[] = [
  { value: 'CONSULT', label: '상담 요청' },
  { value: 'ATTENDANCE', label: '출결' },
  { value: 'STUDY', label: '학습' },
  { value: 'ETC', label: '기타' },
];

export type ParentInquiry = {
  id: string;
  kind: InquiryKind;
  kindLabel: string;
  content: string;
  createdAt: string;
  checked: boolean;
  checkedAt: string | null;
};

export type ParentInquiriesResponse = { studentName: string; items: ParentInquiry[] };

export function sendInquiry(studentId: string, kind: InquiryKind, content: string) {
  return mutateMobileApi<{ id: string }>(`${BASE}/inquiries`, 'POST', { studentId, kind, content });
}

/** 온라인 학습 리포트에 의견 남기기 (리포트 화면에서 사용 가능) */
export function sendOnlineReportFeedback(reportId: string, content: string) {
  return mutateMobileApi<{ ok: true }>(`${BASE}/reports/online/${reportId}/feedback`, 'POST', { content });
}

// ─── 공지사항 ───────────────────────────────────────────────────────

export type ParentNotice = {
  id: string;
  /** parent 학부모 공지(parent_notice) · operations 독서실 공지(월간 운영 공지 monthly_notice) */
  source: 'parent' | 'operations';
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type ParentNoticesResponse = {
  studentName: string;
  grade: string;
  admission: {
    year: number;
    month: number;
    /** null = 전체 학년 대상 */
    forGrade: string | null;
    content: string;
    updatedAt: string;
  } | null;
  notices: ParentNotice[];
};
