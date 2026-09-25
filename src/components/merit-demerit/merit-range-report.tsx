"use client";

import { Fragment, useState, useTransition, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableHeader } from "@/components/ui/sortable-header";
import {
  EmptyState,
  FilterChip,
  Skeleton,
  StatCard,
  StatCards,
  StatusBadge,
  TableCard,
  Toolbar,
} from "@/components/backoffice/ui";
import { getMeritsByRange } from "@/actions/merit-demerit";
import { cn, formatDate } from "@/lib/utils";
import { Search, ChevronDown, CalendarSearch } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";

type SortKey = "name" | "merits" | "demerits" | "net" | "count";
type SortDir = "asc" | "desc";

// 공용 DatePicker 를 툴바 입력 규격(높이 36 · SEED TextInput 테두리)으로 맞춘다
const DATE_TOOLBAR_CLASS =
  "h-9 gap-x1_5 rounded-r2 border-0 bg-bg-layer-default px-x3 t4-regular tabular-nums text-fg-neutral shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)] hover:bg-bg-layer-default-pressed";

const HEAD_CLASS = "h-10 whitespace-nowrap px-x4 t3-medium text-fg-neutral-subtle";

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
      label: "최근 1주일",
      from: (() => {
        const d = new Date(now);
        d.setDate(now.getDate() - 7);
        return fmt(d);
      })(),
      to: fmt(now),
    },
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
    <Fragment>
      <TableRow className="cursor-pointer" onClick={() => setOpen((p) => !p)}>
        <TableCell>
          <span className="t4-medium">{group.name}</span>
          <span className="ml-x1_5 t3-regular text-fg-neutral-subtle">{group.grade}</span>
        </TableCell>
        <TableCell className="text-right text-fg-neutral-muted">{group.records.length}건</TableCell>
        <TableCell className="text-right">
          {group.merits > 0 ? <span className="text-fg-positive">+{group.merits}</span> : <span className="text-fg-placeholder">—</span>}
        </TableCell>
        <TableCell className="text-right">
          {group.demerits > 0 ? <span className="text-fg-critical">-{group.demerits}</span> : <span className="text-fg-placeholder">—</span>}
        </TableCell>
        <TableCell className={cn("text-right t4-bold", net >= 0 ? "text-fg-positive" : "text-fg-critical")}>
          {net >= 0 ? "+" : ""}
          {net}
        </TableCell>
        <TableCell className="w-12 pr-x3 text-right">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen((p) => !p); }}
            aria-expanded={open}
            aria-label={`${group.name} 내역 ${open ? "접기" : "펼치기"}`}
            className="grid size-8 place-items-center rounded-full text-fg-neutral-subtle transition-colors hover:bg-bg-transparent-pressed"
          >
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
          </button>
        </TableCell>
      </TableRow>

      {open && (
        <TableRow className="bg-bg-layer-fill hover:bg-bg-layer-fill">
          <TableCell colSpan={6} className="p-0">
            <ul className="divide-y divide-stroke-neutral-muted">
              {group.records.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-x3 gap-y-x1 px-x5 py-x2_5">
                  <span className="w-24 shrink-0 t3-regular tabular-nums text-fg-neutral-subtle">
                    {formatDate(r.date)}
                  </span>
                  <StatusBadge tone={r.type === "MERIT" ? "ok" : "bad"}>
                    {r.type === "MERIT" ? "상점" : "벌점"}
                  </StatusBadge>
                  <span
                    className={cn(
                      "w-10 shrink-0 t4-bold tabular-nums",
                      r.type === "MERIT" ? "text-fg-positive" : "text-fg-critical",
                    )}
                  >
                    {r.type === "MERIT" ? "+" : "-"}
                    {r.points}
                  </span>
                  {r.category && <span className="shrink-0 t3-regular text-fg-neutral-subtle">{r.category}</span>}
                  <span className="min-w-0 flex-1 t4-regular text-fg-neutral">{r.reason}</span>
                </li>
              ))}
            </ul>
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}

export function MeritRangeReport() {
  const today = new Date().toISOString().slice(0, 10);
  // 기본 조회 기간: 최근 1주일
  const oneWeekAgo = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  })();

  const [from, setFrom] = useState(oneWeekAgo);
  const [to, setTo] = useState(today);
  const [results, setResults] = useState<MeritRecord[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [sortKey, setSortKey] = useState<SortKey>("net");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // 진입 시 기본 기간(최근 1주일)으로 자동 1회 조회 — 빈 화면 대신 바로 결과 표시.
  useEffect(() => {
    startTransition(async () => {
      const data = await getMeritsByRange(oneWeekAgo, today);
      setResults(data as MeritRecord[]);
    });
    // 최초 마운트 1회만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const presets = getPresets();

  const sortProps = { activeKey: sortKey, dir: sortDir, onToggle: handleSort };

  return (
    <div>
      {/* 기간 선택 */}
      <Toolbar>
        <div className="flex items-center gap-x1_5">
          <DatePicker
            value={from || null}
            onChange={(d) => { setFrom(d ?? ""); setResults(null); }}
            placeholder="시작일"
            className={DATE_TOOLBAR_CLASS}
          />
          <span className="t4-regular text-fg-neutral-subtle">~</span>
          <DatePicker
            value={to || null}
            onChange={(d) => { setTo(d ?? ""); setResults(null); }}
            placeholder="종료일"
            className={DATE_TOOLBAR_CLASS}
          />
        </div>
        <Button size="sm" variant="ink" onClick={handleSearch} disabled={isPending}>
          <Search />
          {isPending ? "조회 중…" : "조회"}
        </Button>

        {/* 빠른 프리셋 */}
        <div className="flex flex-wrap gap-x1_5 sm:ml-x2">
          {presets.map((p) => (
            <FilterChip
              key={p.label}
              selected={p.from === from && p.to === to}
              onClick={() => applyPreset(p.from, p.to)}
            >
              {p.label}
            </FilterChip>
          ))}
        </div>
      </Toolbar>

      {/* 결과 */}
      {results === null ? (
        isPending ? (
          <div className="flex flex-col gap-x3" aria-hidden>
            <StatCards>
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-r4" />
              ))}
            </StatCards>
            <Skeleton className="h-48 w-full rounded-r4" />
          </div>
        ) : (
          <TableCard>
            <EmptyState
              compact
              icon={CalendarSearch}
              title="조회를 눌러 결과를 확인해 주세요"
              description="기간을 바꾸면 이전 결과는 지워져요."
            />
          </TableCard>
        )
      ) : (
        <div className={cn("flex flex-col gap-x4", isPending && "opacity-60")}>
          {/* 요약 */}
          <StatCards cols={4}>
            <StatCard label="전체 건수" value={results.length} unit="건" />
            <StatCard label="상점 합계" value={`+${totalMerits}`} unit="점" tone="ok" />
            <StatCard label="벌점 합계" value={`-${totalDemerits}`} unit="점" tone="bad" />
            <StatCard label="대상 원생" value={groups.length} unit="명" />
          </StatCards>

          <TableCard>
            {groups.length === 0 ? (
              <EmptyState
                compact
                icon={CalendarSearch}
                title="이 기간에는 상벌점 내역이 없어요"
                description="위에서 기간을 바꿔 다시 조회해 보세요."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHeader sortKey="name" {...sortProps} className={HEAD_CLASS}>
                      원생
                    </SortableHeader>
                    <SortableHeader sortKey="count" {...sortProps} align="right" className={HEAD_CLASS}>
                      건수
                    </SortableHeader>
                    <SortableHeader sortKey="merits" {...sortProps} align="right" className={HEAD_CLASS}>
                      상점
                    </SortableHeader>
                    <SortableHeader sortKey="demerits" {...sortProps} align="right" className={HEAD_CLASS}>
                      벌점
                    </SortableHeader>
                    <SortableHeader sortKey="net" {...sortProps} align="right" className={HEAD_CLASS}>
                      순점수
                    </SortableHeader>
                    <TableHead className="w-12">
                      <span className="sr-only">펼치기</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map((g) => (
                    <StudentRow key={g.id} group={g} />
                  ))}
                </TableBody>
              </Table>
            )}
          </TableCard>
        </div>
      )}
    </div>
  );
}
