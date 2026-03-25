"use client";

import { useState, useTransition, useEffect } from "react";
import { Trophy } from "lucide-react";
import { getMeritsByRange } from "@/actions/merit-demerit";

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
    <div className="space-y-3">
      {/* 월 선택 */}
      <div className="flex items-center gap-2">
        <input
          type="month"
          value={month}
          onChange={(e) => handleMonthChange(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="button"
          onClick={handleAllTime}
          className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
            allTime ? "bg-foreground text-background" : "hover:bg-muted"
          }`}
        >
          전체
        </button>
        {isPending && <span className="text-xs text-muted-foreground">불러오는 중...</span>}
      </div>

      {/* 랭킹 목록 */}
      <div className="space-y-1.5">
        {ranking.length === 0 && !isPending && (
          <p className="text-sm text-muted-foreground py-4 text-center">해당 기간에 내역이 없습니다</p>
        )}
        {ranking.slice(0, 10).map((s, i) => {
          const net = s.merits - s.demerits;
          return (
            <div key={s.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold w-6 ${i < 3 ? "text-yellow-600" : "text-muted-foreground"}`}>
                  {i + 1}
                </span>
                <span className="text-sm font-medium">{s.name}</span>
                <span className="text-xs text-muted-foreground">{s.grade}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                {s.merits > 0 && <span className="text-green-600">+{s.merits}</span>}
                {s.demerits > 0 && <span className="text-red-600">-{s.demerits}</span>}
                <span className={`font-bold ${net >= 0 ? "text-green-600" : "text-red-600"}`}>
                  ({net >= 0 ? "+" : ""}{net})
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
