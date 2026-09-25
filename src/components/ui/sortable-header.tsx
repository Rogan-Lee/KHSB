"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { SortDir } from "@/hooks/use-sortable-table";

interface Props<K extends string> {
  sortKey: K;
  activeKey: string | null | undefined;
  dir: SortDir | null | undefined;
  onToggle: (key: K) => void;
  children: ReactNode;
  className?: string;
  align?: "left" | "center" | "right";
}

/**
 * 클릭 시 useSortableTable 의 toggle 을 호출하는 <th> 래퍼.
 * ui/table 의 TableHead 와 같은 모양(t3-medium · fg-neutral-subtle) — 정렬 중인 열만 fg-neutral + 방향 화살표,
 * 나머지 열은 호버 시에만 옅은 양방향 아이콘을 보여 준다(굵기·색 차이 없음).
 *
 * @example
 * <SortableHeader sortKey="name" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle}>
 *   이름
 * </SortableHeader>
 */
export function SortableHeader<K extends string>({
  sortKey,
  activeKey,
  dir,
  onToggle,
  children,
  className,
  align = "left",
}: Props<K>) {
  const isActive = activeKey === sortKey;
  const sorted = isActive && (dir === "asc" || dir === "desc");
  return (
    <TableHead
      onClick={() => onToggle(sortKey)}
      aria-sort={sorted ? (dir === "asc" ? "ascending" : "descending") : undefined}
      className={cn(
        "group/sort cursor-pointer select-none transition-colors hover:text-fg-neutral-muted",
        sorted && "text-fg-neutral hover:text-fg-neutral",
        align === "center" && "text-center",
        align === "right" && "text-right",
        className,
      )}
    >
      {/* 키보드 접근용 버튼 — 클릭은 <th> 로 전파되어 onToggle 이 한 번만 호출된다 */}
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-x1 rounded-r1 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring",
          align === "center" && "justify-center",
          align === "right" && "flex-row-reverse",
        )}
      >
        <span>{children}</span>
        {sorted && dir === "asc" && <ArrowUp className="size-3.5 shrink-0" aria-hidden />}
        {sorted && dir === "desc" && <ArrowDown className="size-3.5 shrink-0" aria-hidden />}
        {!sorted && (
          <ArrowUpDown
            className="size-3.5 shrink-0 text-fg-placeholder opacity-0 transition-opacity group-hover/sort:opacity-100"
            aria-hidden
          />
        )}
      </button>
    </TableHead>
  );
}
