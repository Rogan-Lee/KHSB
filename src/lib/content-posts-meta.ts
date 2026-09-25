// 콘텐츠(ContentPost) 유형·작성자 메타 — 관리자 화면, 서버 액션, 학생 포털, 공개 API 공용.
// 클라이언트 컴포넌트에서도 import 하므로 서버 전용 모듈을 참조하지 말 것.

/** 표시 순서 = 관리자 탭 순서 */
export const CONTENT_POST_TYPES = ["review", "mentor", "director", "podcast", "article"] as const;
export type ContentPostType = (typeof CONTENT_POST_TYPES)[number];

/** 자체 작성 글 (본문 markdown 보유, 외부 URL 선택) */
export const INTERNAL_CONTENT_TYPES = ["review", "mentor", "director"] as const;

export const CONTENT_TYPE_META: Record<ContentPostType, { label: string; tone: string }> = {
  review: { label: "후기", tone: "bg-warn-soft text-warn-ink" },
  mentor: { label: "선배 아티클", tone: "bg-violet-soft text-violet-ink" },
  director: { label: "원장 칼럼", tone: "bg-brand-soft text-brand" },
  podcast: { label: "팟캐스트", tone: "bg-info-soft text-info-ink" },
  article: { label: "외부 아티클", tone: "bg-ok-soft text-ok-ink" },
};

export function isContentPostType(v: unknown): v is ContentPostType {
  return typeof v === "string" && (CONTENT_POST_TYPES as readonly string[]).includes(v);
}

/** review · mentor · director → true (본문 작성형). podcast · article → false (외부 링크형) */
export function isInternalType(type: string): boolean {
  return (INTERNAL_CONTENT_TYPES as readonly string[]).includes(type);
}

/** DB 의 임의 문자열을 알려진 유형으로 좁힌다 (알 수 없는 값은 외부 아티클로 취급). */
export function toContentPostType(v: string): ContentPostType {
  return isContentPostType(v) ? v : "article";
}

export function contentTypeLabel(type: string): string {
  return CONTENT_TYPE_META[toContentPostType(type)].label;
}

export type AuthorPreset = {
  /** mentors-data.js 의 MENTORS id 또는 "director" — 정적 사이트가 mentor.html?id= 프로필 링크에 사용 */
  key: string;
  name: string;
  role: string;
  group: "운영진" | "선배 멘토" | "관리팀";
};

// 루트의 mentors-data.js (정적 사이트 MENTORS · MENTOR_ORDER · STAFF_LEADERSHIP · STAFF_TEAM) 기준.
// 멘토진이 바뀌면 여기와 mentors-data.js 를 함께 수정한다. key 는 반드시 mentors-data.js id 와 동일해야 함.
export const AUTHOR_PRESETS: readonly AuthorPreset[] = [
  { key: "director", name: "강한지", role: "대표원장", group: "운영진" },
  { key: "jihoon", name: "정지훈", role: "전체 총괄", group: "운영진" },
  { key: "naeun", name: "김나은", role: "서울대 재학 · 사회탐구·생기부 담당", group: "선배 멘토" },
  { key: "jiwoo", name: "김지우", role: "국제고 출신 · 영어·언어와매체 담당", group: "선배 멘토" },
  { key: "seunghee", name: "조승희", role: "정시·사회탐구 · 멘탈 관리 담당", group: "선배 멘토" },
  { key: "seonhyeok", name: "김선혁", role: "연세대 치대 재학 · 미적·과학탐구 담당", group: "선배 멘토" },
  { key: "donggeon", name: "이동건", role: "고려대 재학 · 미적·과학탐구 담당", group: "선배 멘토" },
  { key: "jiyoung", name: "빙지영", role: "생활 관리 조교", group: "관리팀" },
  { key: "jaewook", name: "박재욱", role: "학습 관리 조교", group: "관리팀" },
  { key: "choongsun", name: "이충선", role: "순공 · 태도 관리 조교", group: "관리팀" },
];

export function findAuthorPreset(key: string | null | undefined): AuthorPreset | undefined {
  if (!key) return undefined;
  return AUTHOR_PRESETS.find((a) => a.key === key);
}
