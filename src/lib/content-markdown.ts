import { createElement } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// 공개 API(외부 정적 사이트)용 markdown → HTML 서버 렌더.
// - markdown 안의 raw HTML 은 통째로 버린다 (skipHtml) — 편집기(tiptap-markdown html:true)가 넣은 태그 포함
// - 링크·이미지 URL 은 http(s) 절대 주소만 허용, 그 외(javascript:, data:, 상대경로, #앵커 등)는 속성 제거
// - 텍스트·속성 이스케이프는 React 렌더러가 처리

const HTTP_URL = /^https?:\/\//i;

function httpOnly(url: string): string | undefined {
  const u = url.trim();
  return HTTP_URL.test(u) ? u : undefined;
}

const components: Components = {
  a: ({ href, title, children }) =>
    href
      ? createElement(
          "a",
          { href, title, target: "_blank", rel: "noopener noreferrer nofollow" },
          children
        )
      : createElement("span", null, children),
  img: ({ src, alt, title }) =>
    typeof src === "string" && src
      ? createElement("img", { src, alt: alt ?? "", title, loading: "lazy" })
      : null,
};

export async function renderContentMarkdown(markdown: string): Promise<string> {
  // App Route 는 react-server 레이어라 react-dom/server 정적 import 가 빌드 에러
  // ("You're importing a component that imports react-dom/server") → 동적 import 로 우회.
  // Next 가 번들한 react-dom/server 는 next/dist/compiled/react(클라이언트 빌드)를 직접 require 하므로 nodejs 런타임에서 정상 동작.
  const { renderToStaticMarkup } = await import("react-dom/server");
  return renderToStaticMarkup(
    createElement(
      Markdown,
      {
        remarkPlugins: [remarkGfm],
        skipHtml: true,
        urlTransform: httpOnly,
        components,
      },
      markdown
    )
  );
}

/** HTML → 대략적인 순수 텍스트 길이 (태그 제거, 엔티티 1글자, 공백 정규화) */
function plainTextLength(html: string): number {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&[#a-z0-9]+;/gi, "x")
    .replace(/\s+/g, " ")
    .trim().length;
}

/** 분당 500자 기준 읽기 시간 (최소 1분) */
export function readingMinutesFromHtml(html: string): number {
  return Math.max(1, Math.ceil(plainTextLength(html) / 500));
}
