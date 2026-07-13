import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { isStaff } from "@/lib/roles";
import { listScheduleProposalsForReview } from "@/actions/online/schedule-proposals";
import { CalendarClock, ChevronRight, MessageSquare } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  SUBMITTED: { label: "검토 대기", cls: "bg-slate-100 text-slate-700" },
  PROPOSED: { label: "학부모 승인 대기", cls: "bg-amber-100 text-amber-800" },
  APPROVED: { label: "승인됨 · 반영 대기", cls: "bg-blue-100 text-blue-800" },
  REJECTED: { label: "반려됨", cls: "bg-rose-100 text-rose-700" },
};

export default async function OnlineSchedulesPage() {
  const user = await getUser();
  if (!isStaff(user?.role)) redirect("/online");

  const proposals = await listScheduleProposalsForReview();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-6 w-6 text-info" />
        <div>
          <h1 className="text-xl font-bold">등원 스케줄 검토</h1>
          <p className="text-sm text-muted-foreground">학생 제출 → 검토·제안 → 학부모 승인 → 입퇴실 일정 반영</p>
        </div>
      </div>

      {proposals.length === 0 ? (
        <div className="rounded-lg border bg-card py-12 text-center text-sm text-muted-foreground">
          검토할 스케줄 제안이 없습니다.
        </div>
      ) : (
        <ul className="space-y-2">
          {proposals.map((p) => (
            <li key={p.id}>
              <Link href={`/online/schedules/${p.id}`} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 hover:bg-accent transition-colors">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_META[p.status]?.cls ?? "bg-gray-100"}`}>
                  {STATUS_META[p.status]?.label ?? p.status}
                </span>
                <span className="font-medium">{p.student.name}</span>
                <span className="text-xs text-muted-foreground">{p.student.grade} · v{p.version}</span>
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
