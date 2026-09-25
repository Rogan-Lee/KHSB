import { paginationButton } from "@seed-design/css/recipes/pagination-button";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

// SEED PaginationButton 레시피 — 투명 배경, 호버 bg-transparent-pressed, 비활성 fg-disabled
const PAGE_BUTTON = cn(
  paginationButton(),
  "size-8 text-fg-neutral disabled:text-fg-disabled [&_svg]:size-4"
);

/**
 * 5개 단위 목록용 공용 페이저 — 처음/이전/다음/맨끝.
 * page는 0-based. pageCount ≤ 1 이면 아무것도 렌더하지 않음.
 */
export function Pager({
  page,
  pageCount,
  onPage,
  className,
}: {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
  className?: string;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="페이지 이동" className={cn("flex items-center justify-between gap-x2", className)}>
      <span className="t3-regular tabular-nums text-fg-neutral-subtle">
        페이지 <span className="t3-bold text-fg-neutral">{page + 1}</span> / {pageCount}
      </span>
      <div className="flex items-center gap-x0_5">
        <button
          type="button"
          className={PAGE_BUTTON}
          onClick={() => onPage(0)}
          disabled={page === 0}
          aria-label="첫 페이지"
        >
          <ChevronsLeft />
        </button>
        <button
          type="button"
          className={PAGE_BUTTON}
          onClick={() => onPage(Math.max(0, page - 1))}
          disabled={page === 0}
          aria-label="이전 페이지"
        >
          <ChevronLeft />
        </button>
        <button
          type="button"
          className={PAGE_BUTTON}
          onClick={() => onPage(Math.min(pageCount - 1, page + 1))}
          disabled={page >= pageCount - 1}
          aria-label="다음 페이지"
        >
          <ChevronRight />
        </button>
        <button
          type="button"
          className={PAGE_BUTTON}
          onClick={() => onPage(pageCount - 1)}
          disabled={page >= pageCount - 1}
          aria-label="마지막 페이지"
        >
          <ChevronsRight />
        </button>
      </div>
    </nav>
  );
}
