// 상태 라벨 + 배지 톤 — 웹 포털 src/components/portal/status.ts 와 같은 문구·톤.

import type { Tone } from '@/design';
import type { SuggestionStatus } from '@/lib/mobile-api';
import type { ApprovalItem, ApprovalKind, QuestionStatus } from '@/lib/api/staff-inbox';

type StatusMeta = { label: string; tone: Tone };

export const QUESTION_STATUS: Record<QuestionStatus, StatusMeta> = {
  OPEN: { label: '답변 대기', tone: 'warn' },
  ANSWERED: { label: '답변 완료', tone: 'ok' },
  RESOLVED: { label: '해결됨', tone: 'gray' },
  ARCHIVED: { label: '보관됨', tone: 'gray' },
};

/** 쪽잠·네트워크 (NapStatus) */
export const REQUEST_STATUS: Record<'PENDING' | 'APPROVED' | 'REJECTED', StatusMeta> = {
  PENDING: { label: '승인 대기', tone: 'warn' },
  APPROVED: { label: '승인됨', tone: 'ok' },
  REJECTED: { label: '거절됨', tone: 'bad' },
};

export const REDEMPTION_STATUS: Record<'PENDING' | 'APPROVED' | 'REJECTED' | 'FULFILLED', StatusMeta> = {
  PENDING: { label: '대기중', tone: 'warn' },
  APPROVED: { label: '지급 대기', tone: 'info' },
  REJECTED: { label: '거절됨', tone: 'gray' },
  FULFILLED: { label: '지급완료', tone: 'ok' },
};

export const EXAM_APPLICATION_STATUS: Record<'PENDING' | 'CONFIRMED' | 'CANCELLED', StatusMeta> = {
  PENDING: { label: '확정 대기', tone: 'warn' },
  CONFIRMED: { label: '확정', tone: 'ok' },
  CANCELLED: { label: '반려', tone: 'gray' },
};

export const SUGGESTION_STATUS: Record<SuggestionStatus, StatusMeta> = {
  RECEIVED: { label: '접수', tone: 'warn' },
  REVIEWING: { label: '검토중', tone: 'info' },
  REFLECTED: { label: '반영완료', tone: 'ok' },
  DECLINED: { label: '보류', tone: 'gray' },
};

export const SUGGESTION_STATUS_ORDER: SuggestionStatus[] = ['RECEIVED', 'REVIEWING', 'REFLECTED', 'DECLINED'];

/** 신청 종류 이름 — 뒤에 "신청"을 붙여 쓴다 (예: "모의고사 신청") */
export const APPROVAL_KIND_LABEL: Record<ApprovalKind, string> = {
  nap: '쪽잠',
  network: '네트워크 사용',
  redemption: '포인트 교환',
  'exam-application': '모의고사',
};

export function approvalStatusMeta(item: ApprovalItem): StatusMeta {
  switch (item.kind) {
    case 'nap':
    case 'network':
      return REQUEST_STATUS[item.status];
    case 'redemption':
      return REDEMPTION_STATUS[item.status];
    case 'exam-application':
      return EXAM_APPLICATION_STATUS[item.status];
  }
}
