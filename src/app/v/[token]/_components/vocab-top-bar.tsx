"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, X } from "lucide-react";

/**
 * 영단어 시험 화면(/v) 공용 상단바 — 포털 헤더와 같은 56px 규격, 상단 safe-area 포함.
 * - leading "back" | "close": 히스토리가 있으면 뒤로, 없으면(카톡 등 직접 진입) fallbackHref 로 이동, 그것도 없으면 창 닫기 시도.
 * - children 을 주면 가운데 제목 대신 그 내용을 그린다(응시 중 진행 상태 등).
 */
export function VocabTopBar({
  leading = "back",
  title,
  fallbackHref,
  trailing,
  children,
}: {
  leading?: "back" | "close" | null;
  title?: ReactNode;
  fallbackHref?: string;
  trailing?: ReactNode;
  children?: ReactNode;
}) {
  const exit = useVocabExit(fallbackHref);
  const Icon = leading === "close" ? X : ChevronLeft;

  return (
    <header
      className="sticky top-0 z-30 bg-[var(--portal-surface)]"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="relative mx-auto flex h-14 max-w-[480px] items-center gap-x1 px-2">
        {leading ? (
          <button
            type="button"
            onClick={exit}
            aria-label={leading === "close" ? "닫기" : "뒤로 가기"}
            className="relative z-10 inline-flex size-x10 shrink-0 items-center justify-center rounded-full text-fg-neutral transition-colors active:bg-bg-transparent-pressed"
          >
            <Icon className={leading === "close" ? "h-6 w-6" : "h-[26px] w-[26px]"} strokeWidth={2.1} />
          </button>
        ) : null}
        {children != null ? (
          <div className="flex min-w-0 flex-1 items-center px-x2">{children}</div>
        ) : (
          title != null && (
            <h1 className="pointer-events-none absolute inset-x-16 truncate text-center t6-bold text-fg-neutral">
              {title}
            </h1>
          )
        )}
        {trailing != null && <div className="relative z-10 ml-auto flex shrink-0 items-center">{trailing}</div>}
      </div>
    </header>
  );
}

/** /v 화면에서 나가기 — 히스토리 뒤로 → fallbackHref → 창 닫기 순 */
export function useVocabExit(fallbackHref?: string) {
  const router = useRouter();
  return () => {
    if (window.history.length > 1) router.back();
    else if (fallbackHref) router.replace(fallbackHref);
    else window.close();
  };
}
