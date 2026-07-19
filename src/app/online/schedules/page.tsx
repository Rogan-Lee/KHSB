import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { isStaff } from "@/lib/roles";
import { listScheduleProposalsForReview } from "@/actions/online/schedule-proposals";
import { CalendarClock } from "lucide-react";
import { SchedulesPanel, type ProposalRow } from "./schedules-panel";

export const dynamic = "force-dynamic";

export default async function OnlineSchedulesPage() {
  const user = await getUser();
  if (!isStaff(user?.role)) redirect("/online");

  const proposals = await listScheduleProposalsForReview("recent");
  const rows: ProposalRow[] = proposals.map((p) => ({
    id: p.id,
    status: p.status,
    version: p.version,
    studentName: p.student.name,
    studentGrade: p.student.grade,
    scheduledFor: p.scheduledFor ? p.scheduledFor.toISOString() : null,
    updatedAt: p.updatedAt.toISOString(),
    createdAt: p.createdAt.toISOString(),
    feedbackCount: p._count.feedbacks,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-6 w-6 text-info" />
        <div>
          <h1 className="text-xl font-bold">등원 스케줄 검토</h1>
          <p className="text-sm text-muted-foreground">학생 제출 → 검토·제안 → 학부모 승인 → 입퇴실 일정 반영</p>
        </div>
      </div>

      <SchedulesPanel proposals={rows} />
    </div>
  );
}
