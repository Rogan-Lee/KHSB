// 학생 콘텐츠(후기·칼럼·팟캐스트) — 웹 학생 포털 /s/[token]/contents(·[id]) 의 네이티브판.
// 서버: src/lib/mobile-student-contents.ts (공개 글만, 최신순 50개)

const BASE = '/api/mobile/v1/student/contents';

export const studentContentPaths = {
  list: BASE,
  detail: (id: string) => `${BASE}/${encodeURIComponent(id)}`,
};

/** review 후기 · mentor 선배 아티클 · director 원장 칼럼 (앱 안에서 읽는 글) · podcast · article (외부 링크) */
export type ContentType = 'review' | 'mentor' | 'director' | 'podcast' | 'article';

export const CONTENT_TYPE_ORDER: ContentType[] = ['review', 'mentor', 'director', 'podcast', 'article'];

export type StudentContentItem = {
  id: string;
  type: ContentType;
  typeLabel: string;
  title: string;
  summary: string | null;
  coverImageUrl: string | null;
  /** ISO */
  publishedAt: string;
  authorName: string | null;
  /** 외부 링크형이면 원문 주소 — 목록에서 바로 연다. null 이면 앱 상세 화면 */
  externalUrl: string | null;
};

export type StudentContentsResponse = { items: StudentContentItem[] };

export type StudentContentDetail = {
  id: string;
  type: ContentType;
  typeLabel: string;
  title: string;
  summary: string | null;
  coverImageUrl: string | null;
  publishedAt: string;
  authorName: string | null;
  authorRole: string | null;
  /** 원문(외부) 주소 — "원문 보기" */
  url: string | null;
  /** 본문 마크다운 (서버에서 앱 렌더러용으로 정리됨) */
  body: string | null;
};
