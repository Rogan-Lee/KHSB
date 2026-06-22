import { prisma } from "@/lib/prisma";
import { hasGatePass, checkExpiry } from "@/lib/token-auth";
import { ParentGate } from "@/components/magic-link-gate/parent-gate";
import { TokenNotice, reasonToNotice } from "@/components/magic-link-gate/token-notice";
import { ScheduleApprovalView } from "./approval-view";
import type { AttendanceSlot, OutingSlot } from "@/components/online/schedule-slots-editor";

export const dynamic = "force-dynamic";

export default async function ParentSchedulePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const proposal = await prisma.scheduleProposal.findUnique({
    where: { token },
    include: { student: { select: { id: true, name: true, grade: true } } },
  });
  if (!proposal) {
    const n = reasonToNotice("not_found");
    return <TokenNotice title={n.title} body={n.body} />;
  }
  const fail = checkExpiry({ expiresAt: proposal.expiresAt, revokedAt: proposal.revokedAt });
  if (fail) {
    const n = reasonToNotice(fail);
    return <TokenNotice title={n.title} body={n.body} />;
  }

  const gated = await hasGatePass("PARENT", token, proposal.student.id);
  if (!gated) {
    return <ParentGate model="schedule" token={token} />;
  }

  return (
    <ScheduleApprovalView
      token={token}
      studentName={proposal.student.name}
      studentGrade={proposal.student.grade}
      status={proposal.status}
      attendance={(proposal.proposedAttendance as unknown as AttendanceSlot[]) ?? []}
      outings={(proposal.proposedOutings as unknown as OutingSlot[]) ?? []}
      adminNote={proposal.adminNote}
    />
  );
}
