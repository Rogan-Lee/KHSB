// 영단어 시험 표시 규칙 — 웹 포털 /s/[token]/vocab, /v/[token] 과 같은 문구.

import { kstDaysUntil } from '@/features/student-tasks/status';

/**
 * 태블릿에서 시험 흐름(안내 → 응시 → 결과) 화면 폭. 한 문항에 집중하는 화면이라
 * 기본 태블릿 폭(720)보다 좁게, 세 화면이 같은 폭을 쓴다. 폰은 기본(480).
 */
export const VOCAB_TABLET_WIDTH = 560;

/** 통과 기준 점수 */
export const VOCAB_PASS_SCORE = 80;

/** 소수 첫째 자리까지 */
export const fmtScore = (n: number | null | undefined) => Math.round((n ?? 0) * 10) / 10;

/** 마감 3일 이내면 "오늘 마감" / "D-2 마감" */
export function vocabDueLabel(expiresAt: string | null): { label: string; urgent: boolean } | null {
  if (!expiresAt) return null;
  const days = kstDaysUntil(expiresAt);
  if (days > 3) return null;
  return days <= 0 ? { label: '오늘 마감', urgent: true } : { label: `D-${days} 마감`, urgent: false };
}

/** "20문항 · 문항당 10초 · 약 4분" / "20문항 · 시간 제한 없음" */
export function vocabExamMeta(questionCount: number, perQuestionSeconds: number): string {
  return perQuestionSeconds > 0
    ? `${questionCount}문항 · 문항당 ${perQuestionSeconds}초 · 약 ${Math.max(1, Math.ceil((questionCount * perQuestionSeconds) / 60))}분`
    : `${questionCount}문항 · 시간 제한 없음`;
}

/** 소요 시간 — null 이면 "—", 1분 미만이면 "1분 미만" */
export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 60_000) return '1분 미만';
  return `${Math.round(ms / 60_000)}분`;
}
