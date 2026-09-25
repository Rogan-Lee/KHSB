import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { isStaff } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { PageHeader, StatusBadge } from "@/components/backoffice/ui";
import { ScheduleReviewPanel } from "./review-panel";
import { proposalStatus } from "../_lib/status";
import type { AttendanceSlot, OutingSlot } from "@/components/online/schedule-slots-editor";

export const dynamic = "force-dynamic";

export default async function ScheduleReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getUser();
  if (!isStaff(user?.role)) redirect("/online");

  const { id } = await params;
  const proposal = await prisma.scheduleProposal.findUnique({
    where: { id },
    include: {
      student: { select: { id: true, name: true, grade: true } },
      feedbacks: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!proposal) notFound();

  const versions = await prisma.scheduleProposal.findMany({
    where: { studentId: proposal.studentId },
    orderBy: { version: "desc" },
    select: { id: true, version: true, status: true, committedAt: true },
  });

  const st = proposalStatus(proposal.status);

  return (
    <div>
      <PageHeader
        back={{ href: "/online/schedules", label: "등원 스케줄" }}
        title={`${proposal.student.name} 등원 스케줄`}
        meta={
          <>
            <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
            <StatusBadge tone="gray">v{proposal.version}</StatusBadge>
          </>
        }
        description={`${proposal.student.grade} · 학생 제출안을 검토해 제안하고, 학부모 승인을 받아 반영해요.`}
      />

      <ScheduleReviewPanel
        id={proposal.id}
        token={proposal.token}
        status={proposal.status}
        submittedAttendance={(proposal.submittedAttendance as unknown as AttendanceSlot[]) ?? []}
        submittedOutings={(proposal.submittedOutings as unknown as OutingSlot[]) ?? []}
        proposedAttendance={(proposal.proposedAttendance as unknown as AttendanceSlot[]) ?? []}
        proposedOutings={(proposal.proposedOutings as unknown as OutingSlot[]) ?? []}
        adminNote={proposal.adminNote}
        studentMemo={proposal.studentMemo}
        scheduledFor={proposal.scheduledFor ? proposal.scheduledFor.toISOString() : null}
        feedbacks={proposal.feedbacks.map((f) => ({ id: f.id, content: f.content, createdAt: f.createdAt.toISOString() }))}
        versions={versions.map((v) => ({ id: v.id, version: v.version, status: v.status, committedAt: v.committedAt?.toISOString() ?? null }))}
      />
    </div>
  );
}
