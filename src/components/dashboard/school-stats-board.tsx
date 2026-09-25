"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, SearchField, Toolbar } from "@/components/backoffice/ui";
import { ChevronLeft, ChevronRight, School, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useSortableTable } from "@/hooks/use-sortable-table";
import { SortableHeader } from "@/components/ui/sortable-header";
import type { SchoolStatRow } from "@/actions/dashboard-widgets";

export function SchoolStatsBoard({
  year,
  month,
  rows,
}: {
  year: number;
  month: number;
  rows: SchoolStatRow[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const filteredBase = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.school.toLowerCase().includes(q));
  }, [rows, query]);

  const { rows: sorted, sort, toggle } = useSortableTable(filteredBase, {
    school: (r: SchoolStatRow) => r.school,
    total: (r: SchoolStatRow) => r.total,
    newThisMonth: (r: SchoolStatRow) => r.newThisMonth,
    leftThisMonth: (r: SchoolStatRow) => r.leftThisMonth,
    delta: (r: SchoolStatRow) => r.delta,
  });

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        total: acc.total + r.total,
        new: acc.new + r.newThisMonth,
        left: acc.left + r.leftThisMonth,
      }),
      { total: 0, new: 0, left: 0 }
    );
  }, [rows]);

  function goMonth(delta: number) {
    let y = year;
    let m = month + delta;
    if (m < 1) { y -= 1; m = 12; }
    if (m > 12) { y += 1; m = 1; }
    router.push(`/admin/school-stats?year=${y}&month=${m}`);
  }

  return (
    <div>
      {/* 툴바 */}
      <Toolbar>
        <div className="flex items-center gap-x1">
          <Button variant="outline" size="icon" onClick={() => goMonth(-1)} aria-label="이전 달">
            <ChevronLeft />
          </Button>
          <span className="min-w-20 text-center t6-bold tabular-nums text-fg-neutral">
            {year}.{String(month).padStart(2, "0")}
          </span>
          <Button variant="outline" size="icon" onClick={() => goMonth(1)} aria-label="다음 달">
            <ChevronRight />
          </Button>
        </div>

        <SearchField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="학교명 검색"
          aria-label="학교명 검색"
        />

        <span className="t3-regular tabular-nums text-fg-neutral-subtle lg:ml-auto">
          총 {rows.length}개 학교 · 재원 {totals.total}명 · 이달 신규 {totals.new} · 이탈 {totals.left}
        </span>
      </Toolbar>

      {/* 테이블 */}
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHeader sortKey="school" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle}>
              학교명
            </SortableHeader>
            <SortableHeader sortKey="total" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle} align="right">
              재원
            </SortableHeader>
            <SortableHeader sortKey="newThisMonth" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle} align="right">
              이달 신규
            </SortableHeader>
            <SortableHeader sortKey="leftThisMonth" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle} align="right">
              이달 이탈
            </SortableHeader>
            <SortableHeader sortKey="delta" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle} align="right">
              증감
            </SortableHeader>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={5} className="p-0">
                <EmptyState
                  compact
                  icon={School}
                  title={query ? "검색 결과가 없어요" : "등록된 학교 정보가 없어요"}
                  description={query ? "학교명을 다시 확인해 주세요" : undefined}
                />
              </TableCell>
            </TableRow>
          ) : (
            sorted.map((r) => (
              <TableRow key={r.school}>
                <TableCell className="t4-medium">{r.school || "(미지정)"}</TableCell>
                <TableCell className="text-right t4-bold">{r.total}</TableCell>
                <TableCell className="text-right text-fg-positive">
                  {r.newThisMonth > 0 ? `+${r.newThisMonth}` : r.newThisMonth}
                </TableCell>
                <TableCell className="text-right text-fg-critical">
                  {r.leftThisMonth > 0 ? `-${r.leftThisMonth}` : r.leftThisMonth}
                </TableCell>
                <TableCell className="text-right">
                  <DeltaBadge delta={r.delta} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <p className="mt-x3 t3-regular text-fg-neutral-subtle">
        재원 수는 현재 ACTIVE 상태 기준. 신규/이탈은 선택 월 내 startDate/endDate 기준 집계.
      </p>
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-x0_5 t4-bold text-fg-positive">
        <TrendingUp className="size-3.5" aria-hidden />
        +{delta}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="inline-flex items-center gap-x0_5 t4-bold text-fg-critical">
        <TrendingDown className="size-3.5" aria-hidden />
        {delta}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-x0_5 text-fg-neutral-subtle">
      <Minus className="size-3.5" aria-hidden />
      0
    </span>
  );
}
