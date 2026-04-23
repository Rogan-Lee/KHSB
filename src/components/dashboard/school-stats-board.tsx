"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Search, School, TrendingUp, TrendingDown, Minus } from "lucide-react";
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
    <div className="space-y-3">
      {/* 툴바 */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => goMonth(-1)}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="font-bold text-base min-w-[80px] text-center">
          {year}.{String(month).padStart(2, "0")}
        </span>
        <Button variant="outline" size="sm" onClick={() => goMonth(1)}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>

        <div className="relative ml-2 max-w-xs flex-1">
          <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="학교명 검색"
            className="pl-8 h-8"
          />
        </div>

        <span className="ml-auto text-xs text-muted-foreground">
          총 {rows.length}개 학교 / 재원 {totals.total}명 · 이달 신규 {totals.new} · 이탈 {totals.left}
        </span>
      </div>

      {/* 테이블 */}
      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/60 text-xs text-muted-foreground border-b">
              <SortableHeader sortKey="school" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle} className="px-3 py-2 font-medium">
                학교명
              </SortableHeader>
              <SortableHeader sortKey="total" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle} align="right" className="px-3 py-2 font-medium">
                재원
              </SortableHeader>
              <SortableHeader sortKey="newThisMonth" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle} align="right" className="px-3 py-2 font-medium">
                이달 신규
              </SortableHeader>
              <SortableHeader sortKey="leftThisMonth" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle} align="right" className="px-3 py-2 font-medium">
                이달 이탈
              </SortableHeader>
              <SortableHeader sortKey="delta" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle} align="right" className="px-3 py-2 font-medium">
                증감
              </SortableHeader>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  {query ? "검색 결과 없음" : "등록된 학교 정보가 없습니다"}
                </td>
              </tr>
            ) : (
              sorted.map((r) => (
                <tr key={r.school} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <School className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{r.school || "(미지정)"}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.total}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                    {r.newThisMonth > 0 ? `+${r.newThisMonth}` : r.newThisMonth}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-700">
                    {r.leftThisMonth > 0 ? `-${r.leftThisMonth}` : r.leftThisMonth}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <DeltaBadge delta={r.delta} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground">
        재원 수는 현재 ACTIVE 상태 기준. 신규/이탈은 선택 월 내 startDate/endDate 기준 집계.
      </p>
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-emerald-700 font-semibold">
        <TrendingUp className="h-3 w-3" />
        +{delta}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-red-700 font-semibold">
        <TrendingDown className="h-3 w-3" />
        {delta}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-muted-foreground">
      <Minus className="h-3 w-3" />
      0
    </span>
  );
}
