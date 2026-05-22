// 학생 건의사항 — 카테고리/상태 라벨 + 배지 색상. 클라이언트/서버 공용(순수 모듈).
import type { SuggestionCategory, SuggestionStatus } from "@/generated/prisma/enums";

export const CATEGORY_LABELS: Record<SuggestionCategory, string> = {
  FACILITY: "시설",
  CLASS: "수업",
  OPERATION: "운영",
  ETC: "기타",
};

export const CATEGORY_ORDER: SuggestionCategory[] = ["FACILITY", "CLASS", "OPERATION", "ETC"];

export const STATUS_LABELS: Record<SuggestionStatus, string> = {
  RECEIVED: "접수",
  REVIEWING: "검토중",
  REFLECTED: "반영완료",
  DECLINED: "보류",
};

export const STATUS_ORDER: SuggestionStatus[] = ["RECEIVED", "REVIEWING", "REFLECTED", "DECLINED"];

// Tailwind 클래스 (배지). feature-request-board 색상 체계와 유사.
export const STATUS_BADGE: Record<SuggestionStatus, string> = {
  RECEIVED: "bg-amber-100 text-amber-700 border-amber-200",
  REVIEWING: "bg-blue-100 text-blue-700 border-blue-200",
  REFLECTED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  DECLINED: "bg-gray-100 text-gray-600 border-gray-200",
};
