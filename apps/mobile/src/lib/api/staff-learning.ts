// 직원 멘토링·학습 관리(T3) — 응답 타입과 클라이언트 함수.
// 서버: src/lib/mobile-staff-{mentoring,parent-reports,vocab,portal-link}.ts, src/lib/mobile-tasks.ts

import {
  mutateMobileApi,
  type MentoringRecordResponse,
  type MobileTaskFile,
  type MobileTaskSubmission,
} from '@/lib/mobile-api';

// ─── 멘토링 ──────────────────────────────────────────────────────────

export type MentoringRange = 'today' | 'week';
export type MentoringState = 'SCHEDULED' | 'NEEDS_RECORD' | 'COMPLETED';

export type MentoringSessionItem = {
  id: string;
  studentId: string;
  studentName: string;
  grade: string;
  seat: string | null;
  mentorId: string;
  mentorName: string;
  isMine: boolean;
  /** KST "YYYY-MM-DD" */
  dateKey: string;
  startsAt: string;
  /** "14:00" — 시각 없이 날짜만 잡힌 일정은 null */
  timeLabel: string | null;
  endTimeLabel: string | null;
  state: MentoringState;
  stateLabel: string;
  hasParentReport: boolean;
};

export type MentoringScheduleResponse = {
  range: MentoringRange;
  today: string;
  startDate: string;
  endDate: string;
  /** mine = 멘토(본인 일정만), all = 운영진 전체 */
  scope: 'mine' | 'all';
  items: MentoringSessionItem[];
  /** 범위 이전 14일 안에 기록이 밀린 멘토링 */
  backlog: MentoringSessionItem[];
  summary: {
    total: number;
    scheduled: number;
    needsRecord: number;
    completed: number;
    backlog: number;
  };
};

export type MentoringDetailResponse = MentoringRecordResponse & {
  mentorId: string;
  mentorName: string;
  isMine: boolean;
  dateKey: string;
  startsAt: string;
  timeLabel: string | null;
  endTimeLabel: string | null;
  actualDate: string | null;
  actualStartTime: string | null;
  actualEndTime: string | null;
  state: MentoringState;
  stateLabel: string;
  cancelled: boolean;
  photos: { id: string; name: string; thumbnailUrl: string | null; url: string }[];
  parentReport: {
    id: string;
    createdAt: string;
    expiresAt: string | null;
    active: boolean;
    url: string;
  } | null;
  previous: { date: string; nextGoals: string | null; weaknesses: string | null } | null;
};

export type MentoringRecordInput = {
  content: string;
  improvements: string;
  weaknesses: string;
  nextGoals: string;
  notes: string;
};

export const mentoringSchedulePath = (range: MentoringRange) =>
  `/api/mobile/v1/staff/mentoring/schedule?range=${range}`;
export const mentoringDetailPath = (id: string) => `/api/mobile/v1/staff/mentoring/${id}/detail`;

/** 기록 저장 + 완료 처리 (서버: mobile-workflows completeMobileMentoring) */
export function saveMentoringRecord(id: string, body: MentoringRecordInput) {
  return mutateMobileApi<{ ok: true }>(`/api/mobile/v1/staff/mentoring/${id}`, 'PATCH', body);
}

// ─── 학부모 리포트 ────────────────────────────────────────────────────

export const PARENT_REPORTS_PATH = '/api/mobile/v1/staff/parent-reports';

export type StaffParentReportItem = {
  studentId: string;
  studentName: string;
  grade: string;
  school: string | null;
  mentoring: {
    id: string;
    date: string;
    mentorName: string;
    isMine: boolean;
    hasNotes: boolean;
  };
  report: {
    id: string;
    createdAt: string;
    expiresAt: string | null;
    url: string;
    shareText: string;
  } | null;
  status: 'PENDING' | 'SENT';
};

export type StaffParentReportsResponse = {
  items: StaffParentReportItem[];
  summary: { pending: number; sent: number; noMentoring: number };
};

export type ParentReportCreateResult = {
  id: string;
  mentoringId: string;
  studentId: string;
  studentName: string;
  createdAt: string;
  expiresAt: string | null;
  url: string;
  shareText: string;
  /** 이미 있던 유효 리포트를 다시 돌려준 경우 */
  reused: boolean;
};

export function createParentReport(body: {
  mentoringId?: string;
  studentId?: string;
  customNote?: string | null;
  forceNew?: boolean;
}) {
  return mutateMobileApi<ParentReportCreateResult>(PARENT_REPORTS_PATH, 'POST', body);
}

// ─── 수행평가 ────────────────────────────────────────────────────────

export type StaffTaskStatus = 'OPEN' | 'IN_PROGRESS' | 'SUBMITTED' | 'NEEDS_REVISION' | 'DONE';
export type TaskFeedbackStatus = 'COMMENT' | 'NEEDS_REVISION' | 'APPROVED';

export const STAFF_TASKS_PATH = '/api/mobile/v1/staff/tasks';
export const staffTaskPath = (taskId: string) => `/api/mobile/v1/staff/tasks/${taskId}`;

export type StaffTaskItem = {
  dueDate: string;
  id: string;
  latestSubmission: {
    feedbackCount: number;
    id: string;
    submittedAt: string;
    version: number;
  } | null;
  status: StaffTaskStatus;
  statusLabel: string;
  student: { grade: string; id: string; name: string; school: string | null };
  subject: string;
  submissionCount: number;
  title: string;
  updatedAt: string;
};

export type StaffTaskListResponse = {
  items: StaffTaskItem[];
  /** all = 원장(전체), assigned = 담당 학생만 */
  scope: 'all' | 'assigned';
  canWriteFeedback: boolean;
  summary: {
    active: number;
    done: number;
    needsFeedback: number;
    needsRevision: number;
    review: number;
  };
};

export type StaffTaskDetailResponse = {
  canWriteFeedback: boolean;
  description: string | null;
  dueDate: string;
  format: string | null;
  id: string;
  scoreWeight: number | null;
  status: StaffTaskStatus;
  statusLabel: string;
  student: { grade: string; id: string; name: string; school: string | null };
  subject: string;
  submissions: MobileTaskSubmission[];
  title: string;
};

export function postTaskFeedback(
  submissionId: string,
  body: { content: string; files: MobileTaskFile[]; status: TaskFeedbackStatus },
) {
  return mutateMobileApi<{ ok: true; status: TaskFeedbackStatus }>(
    `/api/mobile/v1/staff/tasks/submissions/${submissionId}/feedback`,
    'POST',
    body,
  );
}

// ─── 영단어 시험 ──────────────────────────────────────────────────────

export type VocabAttemptStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED';

export type StaffVocabAttempt = {
  id: string;
  examId: string;
  examTitle: string;
  isRetake: boolean;
  student: { id: string; name: string; grade: string };
  status: VocabAttemptStatus;
  statusLabel: string;
  score: number | null;
  correctCount: number;
  totalQuestions: number;
  assignedAt: string;
  startedAt: string | null;
  submittedAt: string | null;
  expiresAt: string | null;
  /** 응시 링크 유효기간이 지남 (재발급 필요) */
  linkExpired: boolean;
  canReissue: boolean;
  url: string | null;
  /** 보낼 수 있는 링크일 때만 (미제출·유효) */
  shareText: string | null;
};

export type StaffVocabExam = {
  id: string;
  title: string;
  bookName: string;
  direction: 'EN_TO_KO' | 'KO_TO_EN' | 'MIXED';
  directionLabel: string;
  questionCount: number;
  perQuestionSeconds: number;
  createdAt: string;
  isRetake: boolean;
  assignedCount: number;
  submittedCount: number;
  waitingCount: number;
  avgScore: number | null;
};

export type StaffVocabOverviewResponse = {
  summary: {
    waiting: number;
    inProgress: number;
    submittedThisWeek: number;
    avgScoreThisWeek: number | null;
  };
  attempts: StaffVocabAttempt[];
  exams: StaffVocabExam[];
};

export type StaffVocabExamResponse = {
  exam: StaffVocabExam;
  attempts: StaffVocabAttempt[];
};

export type StaffVocabRosterResponse = {
  students: {
    id: string;
    name: string;
    grade: string;
    school: string | null;
    seat: string | null;
    isOnlineManaged: boolean;
    assigned: boolean;
  }[];
};

export const STAFF_VOCAB_PATH = '/api/mobile/v1/staff/vocab';
export const staffVocabExamPath = (examId: string) => `/api/mobile/v1/staff/vocab/exams/${examId}`;
export const staffVocabRosterPath = (examId: string | null) =>
  `/api/mobile/v1/staff/vocab/students${examId ? `?examId=${encodeURIComponent(examId)}` : ''}`;

export function assignVocabExam(examId: string, studentIds: string[]) {
  return mutateMobileApi<{ added: number; skipped: number }>(
    `/api/mobile/v1/staff/vocab/exams/${examId}/assign`,
    'POST',
    { studentIds },
  );
}

export function reissueVocabAttempt(attemptId: string) {
  return mutateMobileApi<{ attempt: StaffVocabAttempt }>(
    `/api/mobile/v1/staff/vocab/attempts/${attemptId}/reissue`,
    'POST',
  );
}

// ─── 학생 포털 링크 ──────────────────────────────────────────────────

export type StaffPortalLinkResponse = {
  student: {
    id: string;
    name: string;
    grade: string;
    school: string | null;
    phone: string | null;
    parentPhone: string | null;
    active: boolean;
  };
  link: {
    url: string;
    issuedAt: string;
    expiresAt: string;
    lastAccessedAt: string | null;
    accessCount: number;
    shareText: string;
  } | null;
};

export type StaffPortalLinkIssueResult = {
  url: string;
  expiresAt: string;
  shareText: string;
  reused: boolean;
};

export const portalLinkPath = (studentId: string) =>
  `/api/mobile/v1/staff/students/${studentId}/portal-link`;

export function issuePortalLink(studentId: string, reissue = false) {
  return mutateMobileApi<StaffPortalLinkIssueResult>(portalLinkPath(studentId), 'POST', { reissue });
}
