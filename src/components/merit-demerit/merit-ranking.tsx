"use client";

import { useState, useTransition, useEffect } from "react";
import { Trophy } from "lucide-react";
import { getMeritsByRange } from "@/actions/merit-demerit";
import { Input } from "@/components/ui/input";
import { EmptyState, FilterChip, Skeleton } from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";

type RankEntry = {
  id: string;
  name: string;
  grade: string;
  merits: number;
  demerits: number;
};

function toMonthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const from = new Date(y, m - 1, 1).toISOString().slice(0, 10);
  const to = new Date(y, m, 0).toISOString().slice(0, 10);
  return { from, to };
}

function currentYM() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function MeritRanking() {
  const [month, setMonth] = useState(currentYM());
  const [allTime, setAllTime] = useState(false);
  const [ranking, setRanking] = useState<RankEntry[]>([]);
  const [isPending, startTransition] = useTransition();

  function load(ym: string, isAllTime: boolean) {
    startTransition(async () => {
      let records;
      if (isAllTime) {
        records = await getMeritsByRange("2000-01-01", "2099-12-31");
      } else {
        const { from, to } = toMonthRange(ym);
        records = await getMeritsByRange(from, to);
      }

      const map: Record<string, RankEntry> = {};
      for (const r of records) {
        if (!map[r.student.id]) {
          map[r.student.id] = { id: r.student.id, name: r.student.name, grade: r.student.grade, merits: 0, demerits: 0 };
        }
        if (r.type === "MERIT") map[r.student.id].merits += r.points;
        else map[r.student.id].demerits += r.points;
      }
      const sorted = Object.values(map).sort(
        (a, b) => (b.merits - b.demerits) - (a.merits - a.demerits)
      );
      setRanking(sorted);
    });
  }

  // 최초 로드
  useEffect(() => { load(month, false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleMonthChange(ym: string) {
    setMonth(ym);
    setAllTime(false);
    load(ym, false);
  }

  function handleAllTime() {
    setAllTime(true);
    load(month, true);
  }

  return (
    <div className="flex flex-col gap-x3">
      {/* 기간 선택 */}
      <div className="flex flex-wrap items-center gap-x2">
        <Input
          type="month"
          value={month}
          onChange={(e) => handleMonthChange(e.target.value)}
          aria-label="조회 월"
          className={cn("h-8 w-40 tabular-nums", allTime && "text-fg-neutral-subtle")}
        />
        <FilterChip selected={allTime} onClick={handleAllTime}>
          전체 기간
        </FilterChip>
        {isPending && <span className="t3-regular text-fg-neutral-subtle">불러오는 중…</span>}
      </div>

      {/* 랭킹 목록 */}
      {isPending && ranking.length === 0 ? (
        <div className="flex flex-col gap-x3 py-x2" aria-hidden>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : ranking.length === 0 ? (
        <EmptyState
          compact
          icon={Trophy}
          title="이 기간에는 상벌점 내역이 없어요"
          description="다른 달을 고르거나 전체 기간으로 볼 수 있어요."
        />
      ) : (
        <ol className={cn("-mx-2 flex flex-col", isPending && "opacity-60")}>
          {ranking.slice(0, 10).map((s, i) => {
            const net = s.merits - s.demerits;
            const top = i < 3;
            return (
              <li key={s.id} className="flex items-center gap-x3 rounded-r2 px-x2 py-x2_5">
                <span
                  className={cn(
                    "grid size-x7 shrink-0 place-items-center rounded-full tabular-nums",
                    top ? "bg-bg-brand-weak t4-bold text-fg-brand" : "t4-medium text-fg-neutral-subtle",
                  )}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <span className={cn("t4-medium text-fg-neutral", top && "t4-bold")}>{s.name}</span>
                  <span className="ml-x1_5 t3-regular text-fg-neutral-subtle">{s.grade}</span>
                </div>
                <span className="t3-regular tabular-nums text-fg-neutral-subtle">
                  {s.merits > 0 && <span className="text-fg-positive">+{s.merits}</span>}
                  {s.merits > 0 && s.demerits > 0 && " · "}
                  {s.demerits > 0 && <span className="text-fg-critical">-{s.demerits}</span>}
                </span>
                <span
                  className={cn(
                    "w-12 shrink-0 text-right t5-bold tabular-nums",
                    net >= 0 ? "text-fg-positive" : "text-fg-critical",
                  )}
                >
                  {net >= 0 ? "+" : ""}
                  {net}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
