// H룸 좌석 번호 (54 ~ 86)
export const H_ROOM_SEATS: number[] = Array.from({ length: 33 }, (_, i) => 54 + i);

export const DEFAULT_SUBJECTS = ["국어", "수학", "영어", "탐구1", "탐구2"] as const;

/** 학년별 시험 과목 프리셋 (현행 기준) */
export const SUBJECT_PRESETS: { id: string; label: string; subjects: string[] }[] = [
  { id: "grade1", label: "고1 전국연합 (국/수/영/한국사/통합사회/통합과학)", subjects: ["국어", "수학", "영어", "한국사", "통합사회", "통합과학"] },
  { id: "grade2", label: "고2 전국연합 (국/수/영/한국사/사회탐구/과학탐구)", subjects: ["국어", "수학", "영어", "한국사", "사회탐구", "과학탐구"] },
  { id: "grade3", label: "고3 수능/모의 (국/수/영/한국사/탐구1/탐구2)", subjects: ["국어", "수학", "영어", "한국사", "탐구1", "탐구2"] },
  { id: "school-major", label: "내신 주요 (국/수/영)", subjects: ["국어", "수학", "영어"] },
  { id: "english-only", label: "영어 단독", subjects: ["영어"] },
];

/** 개별 추가 가능한 과목 카탈로그 */
export const SUBJECT_CATALOG: { group: string; items: string[] }[] = [
  { group: "공통", items: ["국어", "수학", "영어", "한국사"] },
  { group: "고1/고2 통합", items: ["통합사회", "통합과학"] },
  { group: "탐구(묶음)", items: ["사회탐구", "과학탐구", "탐구1", "탐구2"] },
  { group: "사회탐구 과목", items: ["생활과 윤리", "윤리와 사상", "한국지리", "세계지리", "동아시아사", "세계사", "경제", "정치와 법", "사회·문화"] },
  { group: "과학탐구 과목", items: ["물리학Ⅰ", "화학Ⅰ", "생명과학Ⅰ", "지구과학Ⅰ", "물리학Ⅱ", "화학Ⅱ", "생명과학Ⅱ", "지구과학Ⅱ"] },
  { group: "기타", items: ["제2외국어", "한문", "직업탐구"] },
];
