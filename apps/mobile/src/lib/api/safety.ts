// 신고·차단 클라이언트 — 서버: src/lib/safety.ts, /api/mobile/v1/safety/*

import { mutateMobileApi } from '@/lib/mobile-api';

export const SAFETY_REPORTS_PATH = '/api/mobile/v1/safety/reports';
export const SAFETY_BLOCKS_PATH = '/api/mobile/v1/safety/blocks';

export type SafetyUserType = 'STUDENT' | 'STAFF';
export type SafetyUser = { type: SafetyUserType; id: string; name: string };

export type ReportMessageType = 'CHAT_MESSAGE' | 'QUESTION_MESSAGE' | 'STAFF_DM_MESSAGE';
export type ReportReason = 'ABUSE' | 'SEXUAL' | 'SPAM' | 'PRIVACY' | 'OTHER';

/** 서버 REPORT_REASONS 와 같은 순서·문구 */
export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'ABUSE', label: '욕설·비방·괴롭힘' },
  { value: 'SEXUAL', label: '성적이거나 불쾌한 내용' },
  { value: 'SPAM', label: '광고·도배' },
  { value: 'PRIVACY', label: '개인정보 노출' },
  { value: 'OTHER', label: '기타' },
];

export const REPORT_DETAIL_MAX = 1000;

export type BlockedUser = { id: string; user: SafetyUser; createdAt: string };
export type BlockListResponse = { blocks: BlockedUser[] };

/** 메시지 신고(message 있음) 또는 사용자 신고 */
export function submitReport(input: {
  user: SafetyUser;
  message?: { type: ReportMessageType; id: string };
  reason: ReportReason;
  detail: string;
}) {
  return mutateMobileApi<{ ok: true; duplicate: boolean }>(SAFETY_REPORTS_PATH, 'POST', {
    ...(input.message
      ? { targetType: input.message.type, targetId: input.message.id }
      : { targetType: 'USER', userType: input.user.type, userId: input.user.id }),
    reason: input.reason,
    detail: input.detail.trim() || null,
  });
}

const ref = (user: Pick<SafetyUser, 'type' | 'id'>) => ({ userType: user.type, userId: user.id });

export function blockUser(user: Pick<SafetyUser, 'type' | 'id'>) {
  return mutateMobileApi<{ ok: true }>(SAFETY_BLOCKS_PATH, 'POST', ref(user));
}

export function unblockUser(user: Pick<SafetyUser, 'type' | 'id'>) {
  return mutateMobileApi<{ ok: true }>(SAFETY_BLOCKS_PATH, 'DELETE', ref(user));
}
