import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * 긴 글(마크다운) 읽기 전용 렌더러 — SEED 토큰 기반 타이포(`.seed-prose`, globals.css).
 * 서버 컴포넌트에서 바로 렌더되므로 TipTap MarkdownViewer 처럼 하이드레이션 후 본문이 늦게 뜨지 않는다.
 * raw HTML 은 렌더하지 않는다(react-markdown 기본값) — 외부 입력에도 안전.
 *
 * 작성 습관 보정:
 * - 한 줄짜리 `[제목]`, 줄 전체가 굵은 `**제목**` 은 소제목으로 (AI 리포트·멘토 메모 관례)
 * - 빈 줄 없는 줄바꿈도 줄바꿈으로 (textarea 에서 Enter 로 쓴 글)
 */
export function Prose({
  source,
  size = "md",
  className,
}: {
  source: string | null | undefined;
  /** md = 본문 16px(학부모 리포트), sm = 14px(카드 안 보조 글) */
  size?: "md" | "sm";
  className?: string;
}) {
  const text = normalize(source);
  if (!text) return null;
  return (
    <div className={cn("seed-prose", size === "sm" && "seed-prose-sm", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

function normalize(source: string | null | undefined): string {
  if (!source) return "";
  // ``` 코드블록 안은 그대로 두고, 바깥 글만 보정한다 (split 결과의 홀수 번째가 코드블록)
  return source
    .replace(/\r\n?/g, "\n")
    .split(/(^```[\s\S]*?^```[ \t]*$)/m)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part
            // `[오늘 멘토링 내용]` 같은 대괄호 한 줄 → 소제목
            .replace(/^[ \t]*\[([^\]\n]{1,40})\][ \t]*$/gm, "### $1")
            // 줄 전체가 굵은 글씨인 짧은 줄(`**이번 주 학습**`, 문장 부호로 끝나지 않음) → 소제목
            // 주간/월간 보고서 생성 프롬프트가 섹션을 이렇게 구분한다.
            .replace(/^[ \t]*\*\*([^*\n]{1,40}?)[ \t]*[:：]?\*\*[ \t]*[:：]?[ \t]*$/gm, (line, title: string) =>
              /[.!?。]$/.test(title.trim()) ? line : `### ${title.trim()}`
            )
            // 문단 안 단일 줄바꿈 → 하드 브레이크
            .replace(/([^\n])\n(?=[^\n])/g, "$1  \n")
    )
    .join("")
    .trim();
}

const COMPONENTS: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  img: ({ src, alt }) =>
    typeof src === "string" ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt ?? ""} loading="lazy" />
    ) : null,
  // 넓은 표는 가로 스크롤
  table: ({ children }) => (
    <div className="seed-prose-table">
      <table>{children}</table>
    </div>
  ),
};
