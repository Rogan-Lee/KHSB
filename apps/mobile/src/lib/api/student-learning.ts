// 학생 학습(수행평가·영단어) — 응답 타입 + 클라이언트 함수.
// 서버: src/lib/mobile-tasks.ts (수행평가), src/lib/mobile-vocab.ts (영단어)

import {
  mutateMobileApi,
  type MobileTaskDetail,
  type MobileTaskFile,
  type MobileTaskSubmission,
  type MobileTaskSummary,
  type StudentTasksResponse,
  type VocabRunnerItem,
  type VocabRunnerState,
} from '@/lib/mobile-api';

export type {
  MobileTaskDetail,
  MobileTaskFile,
  MobileTaskSubmission,
  MobileTaskSummary,
  StudentTasksResponse,
  VocabRunnerItem,
  VocabRunnerState,
};

// ─── 수행평가 ────────────────────────────────────────────────────────

export type TaskStatus = MobileTaskSummary['status'];
export type TaskFeedback = MobileTaskSubmission['feedbacks'][number];
export type TaskFeedbackStatus = TaskFeedback['status'];

/** GET — 목록 (StudentTasksResponse) */
export const STUDENT_TASKS_PATH = '/api/mobile/v1/student/tasks';

/** GET — 상세 (MobileTaskDetail). 조회 시 서버가 미확인 피드백을 읽음 처리한다. */
export function studentTaskPath(taskId: string) {
  return `${STUDENT_TASKS_PATH}/${encodeURIComponent(taskId)}`;
}

/**
 * 과제 제출 — 최신 제출에 피드백이 있으면 새 버전, 없으면 같은 버전을 덮어쓴다(웹 포털과 같은 규칙).
 * files 는 이미 업로드된 파일(url 포함) 목록.
 */
export function submitStudentTask(
  taskId: string,
  input: { files: MobileTaskFile[]; note: string | null },
) {
  return mutateMobileApi<{ ok: boolean; version: number }>(
    `${studentTaskPath(taskId)}/submissions`,
    'POST',
    {
      files: input.files.map(({ mimeType, name, sizeBytes, url }) => ({
        mimeType: mimeType || 'application/octet-stream',
        name,
        sizeBytes,
        url,
      })),
      note: input.note,
    },
  );
}

// ─── 영단어 시험 ─────────────────────────────────────────────────────

export const STUDENT_VOCAB_PATH = '/api/mobile/v1/student/vocab';

export type VocabStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED';
export type VocabDirection = VocabRunnerItem['direction'];

export type StudentVocabItem = {
  id: string;
  title: string;
  status: VocabStatus;
  statusLabel: string;
  questionCount: number;
  perQuestionSeconds: number;
  score: number | null;
  correctCount: number;
  totalQuestions: number;
  assignedAt: string;
  submittedAt: string | null;
  /** 응시 마감 (없으면 기한 없음) */
  expiresAt: string | null;
};

/** GET /student/vocab — 만료(기한 지난 미제출 포함)는 빠져 있다 */
export type StudentVocabList = {
  items: StudentVocabItem[];
  summary: { todo: number; inProgress: number; done: number };
};

export type VocabReviewItem = {
  id: string;
  order: number;
  direction: VocabDirection;
  prompt: string;
  word: string;
  meanings: string[];
  studentAnswer: string | null;
  isCorrect: boolean | null;
  answer: string;
};

/**
 * GET /student/vocab/[attemptId] — 시험 정보(인트로) + 제출 완료면 결과.
 * items 는 제출 완료(SUBMITTED)일 때만 채워진다(정답 노출 방지).
 */
export type StudentVocabAttempt = {
  id: string;
  title: string;
  status: VocabStatus;
  statusLabel: string;
  studentName: string;
  questionCount: number;
  perQuestionSeconds: number;
  assignedAt: string;
  expiresAt: string | null;
  score: number | null;
  correctCount: number;
  totalQuestions: number;
  submittedAt: string | null;
  durationMs: number | null;
  items: VocabReviewItem[];
};

export function studentVocabPath(attemptId: string) {
  return `${STUDENT_VOCAB_PATH}/${encodeURIComponent(attemptId)}`;
}

/** 응시 시작(또는 이어서 풀기) — 문항 목록(정답 미포함) */
export function startStudentVocab(attemptId: string) {
  return mutateMobileApi<VocabRunnerState>(`${studentVocabPath(attemptId)}/start`, 'POST', {});
}

/** 문항 하나 답 저장 — 저장된 답은 중간에 나가도 남는다 */
export function saveStudentVocabAnswer(
  attemptId: string,
  input: { itemId: string; answer: string; timeMs: number },
) {
  return mutateMobileApi<{ ok: boolean }>(`${studentVocabPath(attemptId)}/answer`, 'POST', input);
}

/** 제출(채점 확정) */
export function finalizeStudentVocab(attemptId: string) {
  return mutateMobileApi<{
    attemptId: string;
    score: number;
    correctCount: number;
    totalQuestions: number;
  }>(`${studentVocabPath(attemptId)}/finalize`, 'POST', {});
}
