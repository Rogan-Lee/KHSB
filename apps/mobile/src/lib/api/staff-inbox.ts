// 직원 소통(질문·채팅·직원 DM) · 승인함 · 건의사항 관리 — 응답 타입과 요청 함수.
// 서버: src/lib/mobile-staff-{questions,dm,approvals,suggestions}.ts

import {
  mutateMobileApi,
  type MobileAttachment,
  type SuggestionCategory,
  type SuggestionStatus,
} from '@/lib/mobile-api';

const V1 = '/api/mobile/v1/staff';

export const staffInboxPaths = {
  /** 받은함 전체(보관 제외) — 필터는 화면에서 */
  questions: `${V1}/questions?filter=all`,
  question: (id: string) => `${V1}/questions/${id}`,
  chats: `${V1}/chats`,
  dm: `${V1}/dm`,
  dmThread: (userId: string) => `${V1}/dm/${userId}`,
  approvals: (history: boolean) => `${V1}/approvals${history ? '?history=1' : ''}`,
  suggestions: `${V1}/suggestions`,
};

// ─── 학생 질문 ───────────────────────────────────────────────────────

export type QuestionStatus = 'OPEN' | 'ANSWERED' | 'RESOLVED' | 'ARCHIVED';
export type StaffQuestionFilter = 'waiting' | 'mine' | 'all';

export type StaffQuestionItem = {
  id: string;
  title: string;
  subject: string | null;
  status: QuestionStatus;
  studentId: string;
  studentName: string;
  grade: string;
  school: string | null;
  lastMessage: string;
  lastSenderType: 'STUDENT' | 'STAFF' | null;
  attachmentCount: number;
  lastMessageAt: string;
  createdAt: string;
  claimedBy: { id: string; name: string } | null;
  claimedByMe: boolean;
  unread: number;
  /** 답변 대기 — 미답변이거나 학생이 다시 물어본 질문 */
  waiting: boolean;
  /** 답변 대기 24시간 경과 */
  overdue: boolean;
};

export type StaffQuestionInboxResponse = {
  filter: StaffQuestionFilter;
  items: StaffQuestionItem[];
  summary: { waiting: number; mine: number; all: number; overdue: number; open: number };
};

export type QuestionClaimResponse = {
  ok: true;
  claimedBy: { id: string; name: string } | null;
  previousClaimerName?: string | null;
};

export function claimQuestion(id: string) {
  return mutateMobileApi<QuestionClaimResponse>(`${V1}/questions/${id}/claim`, 'POST');
}

export function releaseQuestion(id: string) {
  return mutateMobileApi<QuestionClaimResponse>(`${V1}/questions/${id}/claim`, 'DELETE');
}

export function setQuestionStatus(id: string, status: 'OPEN' | 'RESOLVED' | 'ARCHIVED') {
  return mutateMobileApi<{ ok: true; status: QuestionStatus }>(
    `${V1}/questions/${id}/status`,
    'PATCH',
    { status },
  );
}

export function answerQuestion(id: string, body: { content: string; attachments: MobileAttachment[] }) {
  return mutateMobileApi<{ ok: true }>(`${V1}/questions/${id}/answer`, 'POST', body);
}

// ─── 직원 DM ─────────────────────────────────────────────────────────

export type StaffDmPartner = { id: string; name: string; roleLabel: string };

export type StaffDmThreadSummary = {
  id: string;
  other: StaffDmPartner;
  lastMessage: { content: string; mine: boolean; createdAt: string } | null;
  lastMessageAt: string;
  unread: number;
};

export type StaffDmInboxResponse = {
  threads: StaffDmThreadSummary[];
  /** 새 메시지를 보낼 수 있는 직원 (나 제외) */
  staff: StaffDmPartner[];
};

export type StaffDmMessage = { id: string; content: string; mine: boolean; createdAt: string };

export type StaffDmThreadResponse = {
  threadId: string;
  other: StaffDmPartner;
  messages: StaffDmMessage[];
};

export function sendStaffDm(userId: string, content: string) {
  return mutateMobileApi<{ ok: true }>(`${V1}/dm/${userId}`, 'POST', { content });
}

// ─── 승인함 ──────────────────────────────────────────────────────────

export type ApprovalKind = 'nap' | 'network' | 'redemption' | 'exam-application';
export type ApprovalDecision = 'APPROVE' | 'REJECT' | 'FULFILL';

export type ApprovalStudent = { id: string; name: string; grade: string; seat: string | null };

type ApprovalBase = {
  id: string;
  student: ApprovalStudent;
  requestedAt: string;
  decidedAt: string | null;
  decidedByName: string | null;
};

export type NapApproval = ApprovalBase & {
  kind: 'nap';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  /** YYYY-MM-DD */
  date: string;
  startTime: string;
  durationMin: number;
  note: string | null;
};

export type NetworkApproval = ApprovalBase & {
  kind: 'network';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  networkKind: 'WIFI_UNBLOCK' | 'DOMAIN_ALLOW' | 'APP_UNBLOCK';
  networkKindLabel: string;
  target: string | null;
  startAt: string;
  endAt: string;
  reason: string;
  appliedAt: string | null;
  expired: boolean;
};

export type RedemptionApproval = ApprovalBase & {
  kind: 'redemption';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'FULFILLED';
  itemName: string;
  points: number;
  /** 대기 중일 때 학생 메모, 거절 후에는 거절 사유 */
  note: string | null;
  balance: number | null;
};

export type ExamApplicationApproval = ApprovalBase & {
  kind: 'exam-application';
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  sessionId: string;
  sessionTitle: string;
  /** YYYY-MM-DD */
  examDate: string;
  room: string;
  subjects: string[];
  memo: string | null;
};

export type ApprovalItem = NapApproval | NetworkApproval | RedemptionApproval | ExamApplicationApproval;

export type ApprovalsSummary = {
  nap: number;
  network: number;
  redemption: number;
  examApplication: number;
  /** 승인됐지만 지급 전인 포인트 교환 */
  fulfill: number;
  total: number;
};

export type ApprovalsResponse = {
  mode: 'pending' | 'history';
  summary: ApprovalsSummary;
  items: ApprovalItem[];
};

export function decideApproval(
  kind: ApprovalKind,
  id: string,
  decision: ApprovalDecision,
  note?: string,
) {
  return mutateMobileApi<{ ok: true; kind: ApprovalKind; id: string; status: string }>(
    `${V1}/approvals/${kind}/${id}`,
    'POST',
    { decision, note: note?.trim() || undefined },
  );
}

// ─── 건의사항 ────────────────────────────────────────────────────────

export type StaffSuggestionItem = {
  id: string;
  category: SuggestionCategory;
  categoryLabel: string;
  title: string;
  content: string;
  status: SuggestionStatus;
  statusLabel: string;
  staffReply: string | null;
  handledByName: string | null;
  handledAt: string | null;
  createdAt: string;
  student: { id: string; name: string; grade: string };
};

export type StaffSuggestionsResponse = {
  items: StaffSuggestionItem[];
  summary: Record<SuggestionStatus, number>;
};

export function updateSuggestion(id: string, body: { status?: SuggestionStatus; reply?: string }) {
  return mutateMobileApi<{ ok: true; item: StaffSuggestionItem }>(`${V1}/suggestions/${id}`, 'PATCH', body);
}
