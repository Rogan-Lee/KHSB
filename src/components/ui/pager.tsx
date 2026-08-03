import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

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
    <div className={cn("flex items-center justify-between gap-2", className)}>
      <span className="text-xs text-muted-foreground tabular-nums">
        페이지 {page + 1} / {pageCount}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => onPage(0)}
          disabled={page === 0}
          aria-label="첫 페이지"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => onPage(Math.max(0, page - 1))}
          disabled={page === 0}
          aria-label="이전 페이지"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => onPage(Math.min(pageCount - 1, page + 1))}
          disabled={page >= pageCount - 1}
          aria-label="다음 페이지"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => onPage(pageCount - 1)}
          disabled={page >= pageCount - 1}
          aria-label="마지막 페이지"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
