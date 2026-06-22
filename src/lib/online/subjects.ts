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

// ── 국어/수학 선택과목 + 탐구 과목 카탈로그 (학생 프로필 구조화용) ──
export const KOREAN_ELECTIVES = ["화법과작문", "언어와매체"] as const;
export const MATH_ELECTIVES = ["확률과통계", "미적분", "기하"] as const;
export const INQUIRY_SUBJECTS = [
  // 사회탐구
  "생활과윤리", "윤리와사상", "한국지리", "세계지리",
  "동아시아사", "세계사", "경제", "정치와법", "사회·문화",
  // 과학탐구
  "물리학Ⅰ", "물리학Ⅱ", "화학Ⅰ", "화학Ⅱ",
  "생명과학Ⅰ", "생명과학Ⅱ", "지구과학Ⅰ", "지구과학Ⅱ",
] as const;

type SubjectElectives = {
  koreanElective?: string | null;
  mathElective?: string | null;
  inquiry1Subject?: string | null;
  inquiry2Subject?: string | null;
};

/**
 * 기본 과목명 + 학생 선택과목 정보를 합쳐 표시용 라벨로 변환.
 * 예) "국어" → "국어(언어와매체)", "탐구1" → "생활과윤리". 표시 전용(데이터 불변).
 */
export function resolveSubjectLabel(base: string, s: SubjectElectives): string {
  switch (base) {
    case "국어":
      return s.koreanElective ? `국어(${s.koreanElective})` : "국어";
    case "수학":
      return s.mathElective ? `수학(${s.mathElective})` : "수학";
    case "탐구1":
      return s.inquiry1Subject || "탐구1";
    case "탐구2":
      return s.inquiry2Subject || "탐구2";
    default:
      return base;
  }
}
