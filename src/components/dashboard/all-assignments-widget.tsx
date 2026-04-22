"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CheckCircle2, Clock, ClipboardCheck, AlertCircle } from "lucide-react";
import type { AssignmentStatusRow } from "@/actions/dashboard-widgets";

type Tab = "upcoming" | "overdue" | "completed" | "all";

const TAB_LABEL: Record<Tab, string> = {
  upcoming: "기한 임박",
  overdue: "기한 초과",
  completed: "완료",
  all: "전체",
};

function daysUntil(due: Date | null, today: Date): number | null {
  if (!due) return null;
  const d = new Date(due);
  d.setHours(0, 0, 0, 0);
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / 86400000);
}

export function AllAssignmentsWidget({ rows }: { rows: AssignmentStatusRow[] }) {
  const today = new Date();
  const [tab, setTab] = useState<Tab>("upcoming");

  const enriched = useMemo(
    () =>
      rows.map((r) => {
        const days = daysUntil(r.dueDate, today);
        let bucket: Tab;
        if (r.isCompleted) bucket = "completed";
        else if (days != null && days < 0) bucket = "overdue";
        else if (days != null && days <= 3) bucket = "upcoming";
        else bucket = "all";
        return { ...r, daysUntil: days, bucket };
      }),
    [rows, today]
  );

  const counts: Record<Tab, number> = {
    upcoming: enriched.filter((r) => r.bucket === "upcoming").length,
    overdue: enriched.filter((r) => r.bucket === "overdue").length,
    completed: enriched.filter((r) => r.bucket === "completed").length,
    all: enriched.length,
  };

  const filtered = useMemo(() => {
    let list = enriched;
    if (tab === "upcoming") list = enriched.filter((r) => r.bucket === "upcoming");
    else if (tab === "overdue") list = enriched.filter((r) => r.bucket === "overdue");
    else if (tab === "completed") list = enriched.filter((r) => r.bucket === "completed");
    // sort: overdue(가장 많이 초과된 것 위), upcoming(가까운 것 위), completed(최근 완료)
    return list.slice().sort((a, b) => {
      if (tab === "completed") {
        return (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0);
      }
      if (a.daysUntil == null && b.daysUntil == null) return 0;
      if (a.daysUntil == null) return 1;
      if (b.daysUntil == null) return -1;
      return a.daysUntil - b.daysUntil;
    }).slice(0, 40);
  }, [enriched, tab]);

  return (
    <Card className="rounded-[12px] border-line shadow-[var(--shadow-xs)] overflow-hidden">
      <CardHeader className="flex flex-row items-center gap-2 py-[14px] px-[18px] border-b border-line-2">
        <ClipboardCheck className="h-4 w-4 text-ink-4" />
        <CardTitle className="text-[13.5px] font-[650] tracking-[-0.015em] text-ink m-0">
          전 원생 과제 현황
        </CardTitle>
        <span className="ml-auto text-[11.5px] text-ink-4 font-mono tabular-nums">
          {counts.all}건
        </span>
      </CardHeader>
      <div className="flex border-b border-line-2 text-[11.5px]">
        {(["upcoming", "overdue", "completed", "all"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 px-3 py-2 transition-colors border-b-2",
              tab === t
                ? "text-ink font-semibold border-brand"
                : "text-ink-4 hover:text-ink border-transparent"
            )}
          >
            {TAB_LABEL[t]}
            <span className="ml-1 text-ink-4 font-mono tabular-nums">{counts[t]}</span>
          </button>
        ))}
      </div>
      <CardContent className="p-0">
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-[12.5px] text-ink-4">
            {tab === "upcoming" && "기한 3일 이내 과제가 없습니다"}
            {tab === "overdue" && (
              <span className="text-ok inline-flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" /> 기한 초과 과제 없음
              </span>
            )}
            {tab === "completed" && "완료된 과제가 없습니다"}
            {tab === "all" && "과제가 없습니다"}
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {filtered.map((r) => (
              <Link
                key={r.id}
                href={`/students/${r.studentId}`}
                className="grid items-center gap-3 px-[18px] py-[10px] border-b border-line-2 last:border-b-0 hover:bg-panel-2 text-[12.5px]"
                style={{ gridTemplateColumns: "auto 1fr auto" }}
              >
                <span className="font-semibold text-ink tracking-[-0.01em] shrink-0">
                  {r.studentName}
                  <span className="text-[10.5px] text-ink-4 ml-1">{r.studentGrade}</span>
                </span>
                <span className="text-ink-3 truncate">
                  {r.subject && <span className="text-ink-4 mr-1">[{r.subject}]</span>}
                  {r.title}
                </span>
                <DueBadge
                  isCompleted={r.isCompleted}
                  daysUntil={r.daysUntil}
                  dueDate={r.dueDate}
                />
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DueBadge({
  isCompleted,
  daysUntil,
  dueDate,
}: {
  isCompleted: boolean;
  daysUntil: number | null;
  dueDate: Date | null;
}) {
  if (isCompleted) {
    return (
      <span className="inline-flex items-center gap-1 text-[10.5px] text-ok bg-ok-soft px-1.5 py-0.5 rounded font-semibold">
        <CheckCircle2 className="h-3 w-3" />
        완료
      </span>
    );
  }
  if (daysUntil == null) {
    return <span className="text-[10.5px] text-ink-4">기한 없음</span>;
  }
  if (daysUntil < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10.5px] text-bad bg-bad-soft px-1.5 py-0.5 rounded font-semibold">
        <AlertCircle className="h-3 w-3" />
        {Math.abs(daysUntil)}일 초과
      </span>
    );
  }
  if (daysUntil === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10.5px] text-warn bg-warn-soft px-1.5 py-0.5 rounded font-semibold">
        <Clock className="h-3 w-3" />
        오늘 마감
      </span>
    );
  }
  if (daysUntil <= 3) {
    return (
      <span className="inline-flex items-center gap-1 text-[10.5px] text-warn bg-warn-soft px-1.5 py-0.5 rounded font-semibold">
        <Clock className="h-3 w-3" />
        {daysUntil}일 남음
      </span>
    );
  }
  return (
    <span className="text-[10.5px] text-ink-4 tabular-nums">
      {dueDate ? `D-${daysUntil}` : ""}
    </span>
  );
}
