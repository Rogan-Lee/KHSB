"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, ChevronRight, MessageSquare, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DeleteProposalButton } from "./delete-proposal-button";

export type ProposalRow = {
  id: string;
  status: string;
  version: number;
  studentName: string;
  studentGrade: string;
  scheduledFor: string | null;
  updatedAt: string;
  createdAt: string;
  feedbackCount: number;
};

type Sort = "recent" | "name" | "submitted";

const SORT_TABS: { key: Sort; label: string }[] = [
  { key: "recent", label: "최신순" },
  { key: "name", label: "이름순" },
  { key: "submitted", label: "제출순" },
];

const STATUS_META: Record<string, { label: string; cls: string }> = {
  SUBMITTED: { label: "검토 대기", cls: "bg-slate-100 text-slate-700" },
  PROPOSED: { label: "학부모 승인 대기", cls: "bg-amber-100 text-amber-800" },
  APPROVED: { label: "승인됨 · 반영 대기", cls: "bg-blue-100 text-blue-800" },
  REJECTED: { label: "반려됨", cls: "bg-rose-100 text-rose-700" },
};

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: "ALL", label: "전체" },
  { key: "SUBMITTED", label: "검토 대기" },
  { key: "PROPOSED", label: "학부모 승인 대기" },
  { key: "APPROVED", label: "승인됨" },
  { key: "REJECTED", label: "반려됨" },
];

export function SchedulesPanel({ proposals }: { proposals: ProposalRow[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: proposals.length };
    for (const p of proposals) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [proposals]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = proposals.filter((p) => {
      if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
      if (q && !p.studentName.toLowerCase().includes(q)) return false;
      return true;
    });
    list.sort((a, b) => {
      if (sort === "name") return a.studentName.localeCompare(b.studentName, "ko");
      if (sort === "submitted") return a.createdAt.localeCompare(b.createdAt); // 제출(생성) 순
      return b.updatedAt.localeCompare(a.updatedAt); // 최신순
    });
    return list;
  }, [proposals, query, sort, statusFilter]);

  return (
    <div className="space-y-3">
      {/* 검색 + 정렬 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="학생 이름으로 검색"
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5">
          {SORT_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setSort(t.key)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                sort === t.key ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-accent"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 상태 필터 */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setStatusFilter(f.key)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
              statusFilter === f.key
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-muted-foreground hover:bg-accent"
            )}
          >
            {f.label}
            <span className="tabular-nums opacity-70">{counts[f.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* 리스트 (자체 스크롤) */}
      <div className="overflow-hidden rounded-lg border bg-card">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {proposals.length === 0 ? "검토할 스케줄 제안이 없습니다." : "조건에 맞는 제안이 없습니다."}
          </div>
        ) : (
          <ul className="max-h-[calc(100vh-320px)] divide-y overflow-y-auto">
            {filtered.map((p) => (
              <li key={p.id} className="flex items-center gap-1 pr-2 transition-colors hover:bg-accent">
                <Link href={`/online/schedules/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3">
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_META[p.status]?.cls ?? "bg-gray-100")}>
                    {STATUS_META[p.status]?.label ?? p.status}
                  </span>
                  <span className="truncate font-medium">{p.studentName}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{p.studentGrade} · v{p.version}</span>
                  {p.scheduledFor && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-info/40 px-2 py-0.5 text-[11px] text-info">
                      <CalendarClock className="h-3 w-3" />
                      {new Date(p.scheduledFor).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })} 예약
                    </span>
                  )}
                  {p.feedbackCount > 0 && (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-rose-600">
                      <MessageSquare className="h-3.5 w-3.5" />
                      {p.feedbackCount}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                    {new Date(p.updatedAt).toLocaleDateString("ko-KR")}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
                <DeleteProposalButton id={p.id} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
