import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { isStaff } from "@/lib/roles";
import { listScheduleProposalsForReview } from "@/actions/online/schedule-proposals";
import { PageHeader } from "@/components/backoffice/ui";
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
    <div>
      <PageHeader
        title="등원 스케줄"
        description="학생이 낸 일정을 검토해 제안하고, 학부모 승인을 받아 입퇴실 일정에 반영해요."
      />
      <SchedulesPanel proposals={rows} />
    </div>
  );
}
