"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import type { SortDir } from "@/hooks/use-sortable-table";
import { cn } from "@/lib/utils";

/**
 * 정렬 가능한 표 머리 칸 — ui/table 의 TableHead 와 같은 글자(t3-medium)로 맞추고,
 * 누르는 부분은 <button> 이라 키보드로도 정렬할 수 있다. useSortableTable 의 sort/toggle 을 그대로 받는다.
 */
export function SortHead<K extends string>({
  sortKey,
  activeKey,
  dir,
  onToggle,
  align = "left",
  className,
  children,
}: {
  sortKey: K;
  activeKey: string | null | undefined;
  dir: SortDir | null | undefined;
  onToggle: (key: K) => void;
  align?: "left" | "right";
  className?: string;
  children: ReactNode;
}) {
  const active = activeKey === sortKey && !!dir;
  return (
    <TableHead
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn(align === "right" && "text-right", className)}
    >
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={cn(
          "-mx-1.5 inline-flex items-center gap-x1 rounded-r1 px-x1_5 py-x1 t3-medium transition-colors hover:bg-bg-transparent-pressed hover:text-fg-neutral focus-visible:outline-2 focus-visible:outline-stroke-focus-ring",
          active ? "text-fg-neutral" : "text-fg-neutral-subtle",
        )}
      >
        {children}
        {active && dir === "asc" && <ArrowUp className="size-3.5" aria-hidden />}
        {active && dir === "desc" && <ArrowDown className="size-3.5" aria-hidden />}
        {!active && <ChevronsUpDown className="size-3.5 text-fg-placeholder" aria-hidden />}
      </button>
    </TableHead>
  );
}
