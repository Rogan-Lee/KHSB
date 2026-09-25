import { MobileApiError } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

// 학생 앱 — 콘텐츠(후기·칼럼·팟캐스트). 웹 학생 포털 /s/[token]/contents(·[id]) 와 같은 공개 범위:
// visible=true 인 글만, 최신 게시순 50개. 자체 작성 글(review·mentor·director)은 앱 상세 화면,
// 외부 링크형(podcast·article)은 원문을 바로 연다.
//
// 스키마 호환: 이 브랜치의 ContentPost 에는 아직 body·authorName·authorRole 이 없을 수 있다
// (자체 작성 글 확장이 별도 브랜치에서 진행 중). select 없이 전체 스칼라를 읽고 선택 필드로 다뤄서
// 두 스키마 모두에서 컴파일·동작한다.

const CONTENT_TYPES = ["review", "mentor", "director", "podcast", "article"] as const;
export type MobileContentType = (typeof CONTENT_TYPES)[number];

/** 웹 content-posts-meta.ts 의 CONTENT_TYPE_META 라벨과 같다 */
const TYPE_LABEL: Record<MobileContentType, string> = {
  review: "후기",
  mentor: "선배 아티클",
  director: "원장 칼럼",
  podcast: "팟캐스트",
  article: "외부 아티클",
};

const INTERNAL_TYPES: readonly MobileContentType[] = ["review", "mentor", "director"];

/** DB 의 임의 문자열 → 알려진 유형 (모르는 값은 외부 아티클로 취급 — 웹과 같은 규칙) */
function toType(v: string): MobileContentType {
  return (CONTENT_TYPES as readonly string[]).includes(v) ? (v as MobileContentType) : "article";
}

type ContentRow = {
  id: string;
  type: string;
  title: string;
  summary: string | null;
  url: string | null;
  coverImageUrl: string | null;
  publishedAt: Date;
  body?: string | null;
  authorName?: string | null;
  authorRole?: string | null;
};

const HTTP_URL = /^https?:\/\//i;
const httpOrNull = (v: string | null | undefined) => {
  const u = v?.trim();
  return u && HTTP_URL.test(u) ? u : null;
};

export type MobileContentListItem = {
  id: string;
  type: MobileContentType;
  typeLabel: string;
  title: string;
  summary: string | null;
  coverImageUrl: string | null;
  publishedAt: string;
  authorName: string | null;
  /** 외부 링크형이면 원문 주소 — 목록에서 바로 연다. null 이면 앱 상세 화면 */
  externalUrl: string | null;
};

export type MobileContentDetail = {
  id: string;
  type: MobileContentType;
  typeLabel: string;
  title: string;
  summary: string | null;
  coverImageUrl: string | null;
  publishedAt: string;
  authorName: string | null;
  authorRole: string | null;
  /** 원문(외부) 주소 — "원문 보기" */
  url: string | null;
  /** 본문 (앱 Markdown 렌더러용으로 정리한 마크다운) */
  body: string | null;
};

function toListItem(row: ContentRow): MobileContentListItem {
  const type = toType(row.type);
  const url = httpOrNull(row.url);
  return {
    id: row.id,
    type,
    typeLabel: TYPE_LABEL[type],
    title: row.title,
    summary: row.summary?.trim() || null,
    coverImageUrl: httpOrNull(row.coverImageUrl),
    publishedAt: row.publishedAt.toISOString(),
    authorName: row.authorName?.trim() || null,
    // 자체 작성 글(또는 URL 없는 글)은 앱 상세, 외부 링크형은 원문 — 웹 포털과 같은 규칙
    externalUrl: !INTERNAL_TYPES.includes(type) && url ? url : null,
  };
}

export async function getStudentContents(): Promise<{ items: MobileContentListItem[] }> {
  const rows: ContentRow[] = await prisma.contentPost.findMany({
    where: { visible: true },
    orderBy: { publishedAt: "desc" },
    take: 50,
  });
  return { items: rows.map(toListItem) };
}

export async function getStudentContent(id: string): Promise<MobileContentDetail> {
  const row: ContentRow | null = await prisma.contentPost.findFirst({
    where: { id, visible: true },
  });
  if (!row) throw new MobileApiError("콘텐츠를 찾을 수 없습니다", 404);
  const item = toListItem(row);
  const body = row.body ? toAppMarkdown(row.body) : "";
  return {
    id: item.id,
    type: item.type,
    typeLabel: item.typeLabel,
    title: item.title,
    summary: item.summary,
    coverImageUrl: item.coverImageUrl,
    publishedAt: item.publishedAt,
    authorName: item.authorName,
    authorRole: row.authorRole?.trim() || null,
    url: httpOrNull(row.url),
    body: body || null,
  };
}

// ─── 본문 정리 ───────────────────────────────────────────────────────
// 관리자 편집기(tiptap-markdown, html:true)는 마크다운으로 못 쓰는 서식을 raw HTML 로 남긴다.
// 앱 렌더러(@/design Markdown)는 HTML 을 그리지 않으므로 흔한 태그는 마크다운으로 바꾸고 나머지 태그는 버린다.
// 링크·이미지는 http(s) 절대 주소만 남긴다 (웹 공개 API content-markdown.ts 와 같은 정책). 코드 블록은 건드리지 않는다.

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

function decodeEntities(s: string) {
  return s.replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (_, k: string) => ENTITIES[k] ?? "");
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  if (!m) return null;
  return decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
}

const stripTags = (s: string) => s.replace(/<[^<>]*>/g, "");

// 태그로 인정할 모양: <이름> 또는 <이름 속성="값" …> — "a<b 비교" 같은 본문 부등호를 태그로 오인하지 않게
const TAIL = `(?:\\s+[a-z][\\w:-]*(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'<>]+))?)*\\s*\\/?>`;
const openTag = (names: string) => `<(${names})${TAIL}`;
const re = (src: string) => new RegExp(src, "gi");

// 서식 없이 걷어낼 태그 (글자는 남긴다)
const PLAIN_TAGS =
  "p|div|span|u|ins|mark|small|big|sub|sup|font|center|section|article|figure|figcaption|ul|ol|dl|dt|dd|" +
  "table|thead|tbody|tfoot|tr|td|th|caption|colgroup|col|blockquote|pre|code|iframe|video|audio|source|" +
  "picture|label|details|summary|li|h[1-6]|a|strong|b|em|i|s|del|strike|img|br|hr";
const PLAIN_OPEN_RE = re(openTag(PLAIN_TAGS));
const PLAIN_CLOSE_RE = re(`<\\/(?:${PLAIN_TAGS})\\s*>`);
const HAS_TAG_RE = new RegExp(`${openTag(PLAIN_TAGS)}|<\\/(?:${PLAIN_TAGS})\\s*>|<!--`, "i");

const IMG_RE = re(openTag("img"));
const A_RE = re(`${openTag("a")}([\\s\\S]*?)<\\/a\\s*>`);
const inlineRe = (names: string) => re(`${openTag(names)}([\\s\\S]*?)<\\/\\1\\s*>`);
const BOLD_RE = inlineRe("strong|b");
const ITALIC_RE = inlineRe("em|i");
const STRIKE_RE = inlineRe("s|del|strike");
const CODE_RE = re(`${openTag("code")}([^<\\n]*)<\\/code\\s*>`);
const HEADING_RE = re(`${openTag("h[1-6]")}([\\s\\S]*?)<\\/h[1-6]\\s*>`);
const LI_RE = re(openTag("li"));
const HR_RE = re(openTag("hr"));
const BLOCK_END_RE = /<\/(?:p|div|ul|ol|blockquote|table|tr|pre|section|article|figure)\s*>/gi;

const wrap = (mark: string) => (_: string, _tag: string, inner: string) =>
  inner.trim() ? `${mark}${inner.trim()}${mark}` : "";

function htmlToMarkdown(seg: string): string {
  if (!HAS_TAG_RE.test(seg)) return seg;
  return seg
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(HR_RE, "\n\n---\n\n")
    .replace(IMG_RE, (tag) => {
      const src = httpOrNull(attr(tag, "src"));
      const alt = (attr(tag, "alt") ?? "").replace(/[[\]\n]/g, "");
      return src ? `\n\n![${alt}](${src})\n\n` : "";
    })
    .replace(A_RE, (tag: string, _name: string, inner: string) => {
      if (inner.includes("![")) return inner; // 링크로 감싼 사진 → 사진만
      const href = httpOrNull(attr(tag.slice(0, tag.indexOf(">") + 1), "href"));
      const label = stripTags(inner).replace(/\s+/g, " ").trim();
      return href ? `[${label || href}](${href})` : label;
    })
    .replace(BOLD_RE, wrap("**"))
    .replace(ITALIC_RE, wrap("*"))
    .replace(STRIKE_RE, wrap("~~"))
    .replace(CODE_RE, (_: string, _tag: string, inner: string) => (inner ? `\`${inner}\`` : ""))
    .replace(HEADING_RE, (tag: string, _name: string, inner: string) => {
      const level = Math.min(3, Number(tag.charAt(2)) || 2);
      return `\n\n${"#".repeat(level)} ${stripTags(inner).trim()}\n\n`;
    })
    .replace(LI_RE, "\n- ")
    .replace(BLOCK_END_RE, "\n\n")
    .replace(PLAIN_OPEN_RE, "")
    .replace(PLAIN_CLOSE_RE, "");
}

// 마크다운 링크·이미지 — 주소 안의 괄호 한 단계까지 허용
const MD_URL = `((?:[^()\\s]|\\([^()\\s]*\\))+)(?:\\s+"[^"]*")?\\)`;
const MD_IMAGE_RE = new RegExp(`!\\[([^\\]\\n]*)\\]\\(${MD_URL}`, "g");
const MD_LINK_RE = new RegExp(`(^|[^!])\\[([^\\]\\n]+)\\]\\(${MD_URL}`, "gm");

/** 앱 파서는 주소 안 괄호를 모르므로 인코딩 */
const encodeParens = (u: string) => u.replace(/\(/g, "%28").replace(/\)/g, "%29");

/** 마크다운 링크·이미지의 주소를 http(s) 로 제한 */
function safeLinks(seg: string): string {
  return seg
    .replace(MD_IMAGE_RE, (_: string, alt: string, src: string) => {
      const u = httpOrNull(src);
      return u ? `![${alt}](${encodeParens(u)})` : "";
    })
    .replace(MD_LINK_RE, (_: string, pre: string, label: string, href: string) => {
      const u = httpOrNull(href);
      return u ? `${pre}[${label}](${encodeParens(u)})` : `${pre}${label}`;
    });
}

export function toAppMarkdown(body: string): string {
  const src = body.replace(/\r\n?/g, "\n");
  // 코드 블록(``` / ~~~)은 그대로 두고 나머지만 정리
  const parts = src.split(/(^(?:```|~~~)[^\n]*\n[\s\S]*?^(?:```|~~~)[ \t]*$)/m);
  return parts
    .map((part, i) =>
      i % 2 === 1 ? part : decodeEntities(safeLinks(htmlToMarkdown(part))).replace(/\n{3,}/g, "\n\n"),
    )
    .join("")
    .trim();
}
