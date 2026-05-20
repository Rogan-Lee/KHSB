// 기본 과목 리스트. Phase 1 고정. Phase 2 에서 학생 선택과목 기반 커스터마이즈.
export const DEFAULT_SUBJECTS = [
  "국어",
  "수학",
  "영어",
  "한국사",
  "탐구1",
  "탐구2",
] as const;

export type SubjectLabel = (typeof DEFAULT_SUBJECTS)[number] | string;
