import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { isStaff } from "@/lib/roles";
import { listScheduleProposalsForReview, type ProposalSort } from "@/actions/online/schedule-proposals";
import { CalendarClock, ChevronRight, MessageSquare } from "lucide-react";
import { DeleteProposalButton } from "./delete-proposal-button";

export const dynamic = "force-dynamic";

const SORT_TABS: { key: ProposalSort; label: string }[] = [
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

export default async function OnlineSchedulesPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const user = await getUser();
  if (!isStaff(user?.role)) redirect("/online");

  const { sort: sortParam } = await searchParams;
  const sort: ProposalSort = SORT_TABS.some((t) => t.key === sortParam) ? (sortParam as ProposalSort) : "recent";
  const proposals = await listScheduleProposalsForReview(sort);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-6 w-6 text-info" />
        <div>
          <h1 className="text-xl font-bold">등원 스케줄 검토</h1>
          <p className="text-sm text-muted-foreground">학생 제출 → 검토·제안 → 학부모 승인 → 입퇴실 일정 반영</p>
        </div>
      </div>

      <div className="flex gap-1.5">
        {SORT_TABS.map((t) => (
          <Link
            key={t.key}
            href={`/online/schedules?sort=${t.key}`}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              sort === t.key ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {proposals.length === 0 ? (
        <div className="rounded-lg border bg-card py-12 text-center text-sm text-muted-foreground">
          검토할 스케줄 제안이 없습니다.
        </div>
      ) : (
        <ul className="space-y-2">
          {proposals.map((p) => (
            <li key={p.id} className="flex items-center gap-1 rounded-lg border bg-card pr-2 hover:bg-accent transition-colors">
              <Link href={`/online/schedules/${p.id}`} className="flex flex-1 items-center gap-3 px-4 py-3 min-w-0">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_META[p.status]?.cls ?? "bg-gray-100"}`}>
                  {STATUS_META[p.status]?.label ?? p.status}
                </span>
                <span className="font-medium">{p.student.name}</span>
                <span className="text-xs text-muted-foreground">{p.student.grade} · v{p.version}</span>
                {p.scheduledFor && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-info/40 px-2 py-0.5 text-[11px] text-info">
                    <CalendarClock className="h-3 w-3" />
                    {new Date(p.scheduledFor).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })} 예약
                  </span>
                )}
                {p._count.feedbacks > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs text-rose-600">
                    <MessageSquare className="h-3.5 w-3.5" />{p._count.feedbacks}
                  </span>
                )}
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {new Date(p.updatedAt).toLocaleDateString("ko-KR")}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
              <DeleteProposalButton id={p.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
