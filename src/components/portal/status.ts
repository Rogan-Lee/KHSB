// 학생 포털 상태 라벨 + 배지 톤 — 페이지마다 중복 정의하던 맵을 한곳에 모음.
// 클라이언트/서버 공용 (순수 모듈).

import type {
  PerformanceTaskStatus,
  StudentQuestionStatus,
  TaskFeedbackStatus,
  NapStatus,
  RedemptionStatus,
  SuggestionStatus,
} from "@/generated/prisma/enums";
import type { Tone } from "./ui";

type StatusMeta = { label: string; tone: Tone };

export const TASK_STATUS: Record<PerformanceTaskStatus, StatusMeta> = {
  OPEN: { label: "진행 전", tone: "gray" },
  IN_PROGRESS: { label: "진행 중", tone: "info" },
  SUBMITTED: { label: "제출 완료", tone: "warn" },
  NEEDS_REVISION: { label: "수정 필요", tone: "bad" },
  DONE: { label: "최종 완료", tone: "ok" },
};

export const QUESTION_STATUS: Record<StudentQuestionStatus, StatusMeta> = {
  OPEN: { label: "답변 대기", tone: "warn" },
  ANSWERED: { label: "답변 완료", tone: "ok" },
  RESOLVED: { label: "해결됨", tone: "gray" },
  ARCHIVED: { label: "보관됨", tone: "gray" },
};

export const FEEDBACK_STATUS: Record<TaskFeedbackStatus, StatusMeta> = {
  COMMENT: { label: "코멘트", tone: "gray" },
  NEEDS_REVISION: { label: "수정 요청", tone: "bad" },
  APPROVED: { label: "승인", tone: "ok" },
};

/** 쪽잠·네트워크 신청 공용 (NapStatus 재사용) */
export const REQUEST_STATUS: Record<NapStatus, StatusMeta> = {
  PENDING: { label: "승인 대기", tone: "warn" },
  APPROVED: { label: "승인됨", tone: "ok" },
  REJECTED: { label: "거절됨", tone: "bad" },
};

export const REDEMPTION_STATUS: Record<RedemptionStatus, StatusMeta> = {
  PENDING: { label: "대기중", tone: "warn" },
  APPROVED: { label: "승인됨", tone: "info" },
  REJECTED: { label: "거절됨", tone: "gray" },
  FULFILLED: { label: "지급완료", tone: "ok" },
};

export const SUGGESTION_STATUS: Record<SuggestionStatus, StatusMeta> = {
  RECEIVED: { label: "접수", tone: "warn" },
  REVIEWING: { label: "검토중", tone: "info" },
  REFLECTED: { label: "반영완료", tone: "ok" },
  DECLINED: { label: "보류", tone: "gray" },
};

export const SCHEDULE_PROPOSAL_STATUS: Record<string, StatusMeta> = {
  SUBMITTED: { label: "검토 대기", tone: "gray" },
  PROPOSED: { label: "학부모 승인 대기", tone: "warn" },
  APPROVED: { label: "승인됨", tone: "info" },
  REJECTED: { label: "반려됨", tone: "bad" },
  COMMITTED: { label: "반영 완료", tone: "ok" },
  SUPERSEDED: { label: "대체됨", tone: "gray" },
  CANCELLED: { label: "취소됨", tone: "gray" },
};
