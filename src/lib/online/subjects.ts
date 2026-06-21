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

// 평가원 성적표 순서: 국어 → 수학 → 영어 → 한국사 → 탐구 → (기타). 등급표/리포트 정렬 공용 기준.
export const SUBJECT_ORDER = [
  "국어", "수학", "영어", "한국사",
  "사회", "과학", "탐구", "탐구1", "탐구2",
  "직업탐구", "제2외국어",
] as const;

/** 과목명을 평가원 순서 인덱스로 변환. 목록에 없으면 큰 값(뒤로). */
export function subjectOrderIndex(subject: string): number {
  const i = (SUBJECT_ORDER as readonly string[]).indexOf(subject);
  return i === -1 ? 999 : i;
}

/** 과목 문자열 배열을 평가원 순서로 정렬(원본 불변). 미지정 과목은 뒤에 원래 순서 유지. */
export function sortBySubjectOrder<T>(items: T[], getSubject: (item: T) => string): T[] {
  return [...items].sort((a, b) => subjectOrderIndex(getSubject(a)) - subjectOrderIndex(getSubject(b)));
}
