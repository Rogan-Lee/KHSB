// 학생 지시 — 운영진 받은함(학부모 요청 + AI 초안 승인) · 학생 받은 지시 · 확인.
// 서버: src/lib/student-instructions.ts, src/app/api/mobile/v1/{staff,student}/instructions
// 학생 응답에는 학부모 요청 원문이 없다 (원장 결정 2026-11-16 — 학생은 조교 지시로만 본다).

import { mutateMobileApi } from '@/lib/mobile-api';

export const STAFF_INSTRUCTIONS_PATH = '/api/mobile/v1/staff/instructions';
export const STUDENT_INSTRUCTIONS_PATH = '/api/mobile/v1/student/instructions';
export const staffStudentInstructionsPath = (studentId: string) =>
  `${STAFF_INSTRUCTIONS_PATH}?studentId=${encodeURIComponent(studentId)}`;

export const INSTRUCTION_MAX_LEN = 500;

/** 학생에게 보일 문장에 학부모를 떠올리게 하는 말 — 서버 mentionsParent 와 같은 규칙. 보내기 전 경고만 */
export const mentionsParent = (text: string) => /부모|어머니|어머님|아버지|아버님|엄마|아빠|보호자/.test(text);

export type InstructionStudent = { id: string; name: string; grade: string };

/** 학생이 보는 지시 */
export type StudentInstruction = {
  id: string;
  content: string;
  sentByName: string | null;
  sentAt: string | null;
  ackedAt: string | null;
};

export type StudentInstructionsResponse = { items: StudentInstruction[]; unacked: number };

/** 운영진이 보는 지시 — request 는 학부모 요청에서 나온 경우 원본 */
export type StaffInstruction = StudentInstruction & {
  isDraft: boolean;
  createdAt: string;
  student: InstructionStudent;
  request: { id: string; content: string; createdAt: string; createdByName: string } | null;
};

/** 처리 안 한 학부모 요청 (+ AI 초안) */
export type PendingParentRequest = {
  id: string;
  /** "[학습] 수학 더 시켜 주세요" 처럼 종류 접두어가 붙어 있다 */
  content: string;
  createdAt: string;
  createdByName: string;
  student: InstructionStudent;
  draft: { id: string; content: string } | null;
};

export type InstructionInboxResponse = { pending: PendingParentRequest[]; sent: StaffInstruction[] };
export type StaffStudentInstructionsResponse = { items: StaffInstruction[] };

export function sendInstruction(body: {
  studentId: string;
  content: string;
  requestId?: string;
  draftId?: string;
}) {
  return mutateMobileApi<{ item: StaffInstruction }>(STAFF_INSTRUCTIONS_PATH, 'POST', body);
}

export function discardInstructionDraft(id: string) {
  return mutateMobileApi<{ ok: true }>(`${STAFF_INSTRUCTIONS_PATH}/${id}`, 'DELETE');
}

/** AI 초안 다시 만들기 — 시킬 일이 없다고 보면 422 */
export function regenerateInstructionDraft(requestId: string) {
  return mutateMobileApi<{ draft: { id: string; content: string } }>(
    `${STAFF_INSTRUCTIONS_PATH}/draft`,
    'POST',
    { requestId },
  );
}

export function ackInstruction(id: string) {
  return mutateMobileApi<{ ok: true }>(`${STUDENT_INSTRUCTIONS_PATH}/${id}/ack`, 'POST');
}
