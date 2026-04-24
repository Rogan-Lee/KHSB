// B-4 카톡 일일 보고 고정 태그. Phase 2 에서 커스텀 태그 추가.
export const KAKAO_LOG_TAGS = [
  "진도질문",
  "컨디션",
  "고민상담",
  "수면",
  "식사",
  "기타",
] as const;

export type KakaoLogTag = (typeof KAKAO_LOG_TAGS)[number];
