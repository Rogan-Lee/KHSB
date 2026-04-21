"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ReactNode } from "react";
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
 * 활성 컬럼엔 asc/desc 화살표, 비활성 컬럼엔 희미한 양방향 아이콘 표시.
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
  return (
    <th
      onClick={() => onToggle(sortKey)}
      className={cn(
        "cursor-pointer select-none hover:bg-accent/40 transition-colors",
        align === "center" && "text-center",
        align === "right" && "text-right",
        className,
      )}
    >
      <span className={cn(
        "inline-flex items-center gap-1",
        align === "center" && "justify-center",
        align === "right" && "justify-end",
      )}>
        {children}
        {isActive && dir === "asc" && <ArrowUp className="h-3 w-3 shrink-0" />}
        {isActive && dir === "desc" && <ArrowDown className="h-3 w-3 shrink-0" />}
        {!isActive && <ArrowUpDown className="h-3 w-3 shrink-0 opacity-30" />}
      </span>
    </th>
  );
}
