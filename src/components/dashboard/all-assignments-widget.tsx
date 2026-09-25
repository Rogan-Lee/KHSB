"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardList } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, ListItem, Section, SectionLink, StatusBadge } from "@/components/backoffice/ui";
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

  const empty: Record<Tab, { title: string; positive?: boolean }> = {
    upcoming: { title: "기한 3일 이내 과제가 없어요" },
    overdue: { title: "기한이 지난 과제가 없어요", positive: true },
    completed: { title: "완료된 과제가 없어요" },
    all: { title: "등록된 과제가 없어요" },
  };

  return (
    <Section
      title="전 원생 과제 현황"
      count={counts.all}
      actions={<SectionLink href="/assignments">전체 보기</SectionLink>}
      flush
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="px-x5 pb-x3">
        <TabsList variant="segment" aria-label="과제 상태" className="max-w-full overflow-x-auto [scrollbar-width:none]">
          {(["upcoming", "overdue", "completed", "all"] as const).map((t) => (
            <TabsTrigger key={t} value={t} className="px-x2_5 sm:px-x3">
              {TAB_LABEL[t]}
              <span className="tabular-nums text-fg-neutral-subtle">{counts[t]}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {filtered.length === 0 ? (
        <EmptyState
          compact
          icon={empty[tab].positive ? CheckCircle2 : ClipboardList}
          title={empty[tab].title}
          className="border-t border-stroke-neutral-muted"
        />
      ) : (
        <ul className="max-h-96 divide-y divide-stroke-neutral-muted overflow-y-auto border-t border-stroke-neutral-muted">
          {filtered.map((r) => (
            <li key={r.id}>
              <ListItem
                href={`/students/${r.studentId}`}
                title={
                  <>
                    {r.studentName}
                    <span className="ml-x1_5 t3-regular text-fg-neutral-subtle">{r.studentGrade}</span>
                  </>
                }
                description={
                  <>
                    {r.subject && <span className="mr-x1 text-fg-neutral-muted">[{r.subject}]</span>}
                    {r.title}
                  </>
                }
                trailing={<DueBadge isCompleted={r.isCompleted} daysUntil={r.daysUntil} dueDate={r.dueDate} />}
              />
            </li>
          ))}
        </ul>
      )}
    </Section>
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
  if (isCompleted) return <StatusBadge tone="ok">완료</StatusBadge>;
  if (daysUntil == null) return <span className="t3-regular text-fg-neutral-subtle">기한 없음</span>;
  if (daysUntil < 0) return <StatusBadge tone="bad">{Math.abs(daysUntil)}일 초과</StatusBadge>;
  if (daysUntil === 0) return <StatusBadge tone="warn">오늘 마감</StatusBadge>;
  if (daysUntil <= 3) return <StatusBadge tone="warn">{daysUntil}일 남음</StatusBadge>;
  return (
    <span className="t3-regular tabular-nums text-fg-neutral-subtle">
      {dueDate ? `D-${daysUntil}` : ""}
    </span>
  );
}
