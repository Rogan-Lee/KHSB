"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getMeritsByRange } from "@/actions/merit-demerit";
import { formatDate } from "@/lib/utils";
import { Search, ChevronDown, ChevronUp, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

type SortKey = "name" | "merits" | "demerits" | "net" | "count";
type SortDir = "asc" | "desc";

function SortButton({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = col === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className={`flex items-center gap-0.5 text-xs px-2 py-1 rounded-md border transition-colors ${
        active ? "bg-muted border-foreground/30 font-medium" : "hover:bg-muted"
      }`}
    >
      {label}
      {active ? (
        sortDir === "asc" ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-30" />
      )}
    </button>
  );
}

type MeritRecord = {
  id: string;
  date: Date;
  type: "MERIT" | "DEMERIT";
  points: number;
  category: string | null;
  reason: string;
  student: { id: string; name: string; grade: string };
};

type StudentGroup = {
  id: string;
  name: string;
  grade: string;
  merits: number;
  demerits: number;
  records: MeritRecord[];
};

// 빠른 날짜 프리셋
function getPresets() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  return [
    {
      label: "이번 달",
      from: fmt(new Date(y, m, 1)),
      to: fmt(new Date(y, m + 1, 0)),
    },
    {
      label: "지난 달",
      from: fmt(new Date(y, m - 1, 1)),
      to: fmt(new Date(y, m, 0)),
    },
    {
      label: "이번 주",
      from: (() => {
        const d = new Date(now);
        d.setDate(now.getDate() - now.getDay() + 1);
        return fmt(d);
      })(),
      to: fmt(now),
    },
    {
      label: "올해",
      from: fmt(new Date(y, 0, 1)),
      to: fmt(now),
    },
  ];
}

function StudentRow({ group }: { group: StudentGroup }) {
  const [open, setOpen] = useState(false);
  const net = group.merits - group.demerits;

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="font-medium">{group.name}</span>
          <span className="text-sm text-muted-foreground">{group.grade}</span>
          <span className="text-xs text-muted-foreground">{group.records.length}건</span>
        </div>
        <div className="flex items-center gap-3">
          {group.merits > 0 && (
            <span className="text-sm font-medium text-green-600">상점 +{group.merits}</span>
          )}
          {group.demerits > 0 && (
            <span className="text-sm font-medium text-red-600">벌점 -{group.demerits}</span>
          )}
          <span className={`text-sm font-bold ${net >= 0 ? "text-green-600" : "text-red-600"}`}>
            ({net >= 0 ? "+" : ""}{net})
          </span>
          {open
            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="border-t divide-y">
          {group.records.map((r) => (
            <div key={r.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
              <span className="text-muted-foreground text-xs w-20 shrink-0 pt-0.5">
                {formatDate(r.date)}
              </span>
              <Badge
                variant={r.type === "MERIT" ? "default" : "destructive"}
                className="text-[11px] px-1.5 py-0 shrink-0"
              >
                {r.type === "MERIT" ? "상점" : "벌점"}
              </Badge>
              <span className={`font-semibold w-10 shrink-0 ${r.type === "MERIT" ? "text-green-600" : "text-red-600"}`}>
                {r.type === "MERIT" ? "+" : "-"}{r.points}
              </span>
              {r.category && (
                <span className="text-muted-foreground text-xs shrink-0">[{r.category}]</span>
              )}
              <span className="text-foreground">{r.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MeritRangeReport() {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [results, setResults] = useState<MeritRecord[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [sortKey, setSortKey] = useState<SortKey>("net");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function applyPreset(f: string, t: string) {
    setFrom(f);
    setTo(t);
    setResults(null);
  }

  function handleSearch() {
    startTransition(async () => {
      const data = await getMeritsByRange(from, to);
      setResults(data as MeritRecord[]);
    });
  }

  // 학생별 그룹화
  const groups: StudentGroup[] = results
    ? Object.values(
        results.reduce<Record<string, StudentGroup>>((acc, r) => {
          if (!acc[r.student.id]) {
            acc[r.student.id] = {
              id: r.student.id,
              name: r.student.name,
              grade: r.student.grade,
              merits: 0,
              demerits: 0,
              records: [],
            };
          }
          if (r.type === "MERIT") acc[r.student.id].merits += r.points;
          else acc[r.student.id].demerits += r.points;
          acc[r.student.id].records.push(r);
          return acc;
        }, {})
      ).sort((a, b) => {
        let cmp = 0;
        if (sortKey === "name") cmp = a.name.localeCompare(b.name, "ko");
        else if (sortKey === "merits") cmp = a.merits - b.merits;
        else if (sortKey === "demerits") cmp = a.demerits - b.demerits;
        else if (sortKey === "net") cmp = (a.merits - a.demerits) - (b.merits - b.demerits);
        else if (sortKey === "count") cmp = a.records.length - b.records.length;
        return sortDir === "asc" ? cmp : -cmp;
      })
    : [];

  const totalMerits = groups.reduce((s, g) => s + g.merits, 0);
  const totalDemerits = groups.reduce((s, g) => s + g.demerits, 0);

  return (
    <div className="space-y-4">
      {/* 기간 선택 */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setResults(null); }}
            className="h-9 w-36 text-sm"
          />
          <span className="text-muted-foreground text-sm">~</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setResults(null); }}
            className="h-9 w-36 text-sm"
          />
        </div>
        <Button size="sm" onClick={handleSearch} disabled={isPending} className="gap-1.5">
          <Search className="h-3.5 w-3.5" />
          {isPending ? "조회 중..." : "조회"}
        </Button>

        {/* 빠른 프리셋 */}
        <div className="flex gap-1.5 flex-wrap">
          {getPresets().map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p.from, p.to)}
              className="text-xs px-2.5 py-1 rounded-md border hover:bg-muted transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* 결과 */}
      {results !== null && (
        <div className="space-y-3">
          {/* 요약 */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground border-b pb-3">
            <span>
              총 <strong className="text-foreground">{results.length}건</strong>
            </span>
            <span className="text-green-600">상점 합계 +{totalMerits}</span>
            <span className="text-red-600">벌점 합계 -{totalDemerits}</span>
            <span>
              대상 원생 <strong className="text-foreground">{groups.length}명</strong>
            </span>
          </div>

          {groups.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              해당 기간에 상벌점 내역이 없습니다
            </p>
          ) : (
            <>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-muted-foreground mr-1">정렬:</span>
                <SortButton label="순점수" col="net" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortButton label="상점" col="merits" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortButton label="벌점" col="demerits" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortButton label="이름" col="name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortButton label="건수" col="count" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              </div>
              <div className="space-y-2">
                {groups.map((g) => (
                  <StudentRow key={g.id} group={g} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
