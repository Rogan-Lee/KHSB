import type { Tone } from '@/design';
import type { SuggestionCategory, SuggestionItem, SuggestionStatus } from '@/lib/mobile-api';

// 학생 건의사항 — 서버 src/lib/mobile-suggestions.ts (GET·POST /api/mobile/v1/student/suggestions)

export const SUGGESTIONS_PATH = '/api/mobile/v1/student/suggestions';

/** 기존 SuggestionItem + 삭제 처리 시각(원장이 삭제하면 '삭제됨' 안내) */
export type StudentSuggestion = SuggestionItem & { deletedAt?: string | null };

export type StudentSuggestionsResponse = {
  items: StudentSuggestion[];
  summary: { total: number; unseen: number };
};

export const SUGGESTION_CATEGORIES: { value: SuggestionCategory; label: string }[] = [
  { value: 'FACILITY', label: '시설' },
  { value: 'CLASS', label: '수업' },
  { value: 'OPERATION', label: '운영' },
  { value: 'ETC', label: '기타' },
];

/** 웹 src/components/portal/status.ts SUGGESTION_STATUS 와 동일 */
export const SUGGESTION_STATUS: Record<SuggestionStatus, { label: string; tone: Tone }> = {
  RECEIVED: { label: '접수', tone: 'warn' },
  REVIEWING: { label: '검토중', tone: 'info' },
  REFLECTED: { label: '반영완료', tone: 'ok' },
  DECLINED: { label: '보류', tone: 'gray' },
};
