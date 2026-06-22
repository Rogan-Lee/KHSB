import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getUser } from "@/lib/auth";
import { isFullAccess } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { ScheduleReviewPanel } from "./review-panel";
import type { AttendanceSlot, OutingSlot } from "@/components/online/schedule-slots-editor";

export const dynamic = "force-dynamic";

export default async function ScheduleReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getUser();
  if (!isFullAccess(user?.role)) redirect("/online");

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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/online/schedules" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold">{proposal.student.name} · 등원 스케줄 v{proposal.version}</h1>
      </div>

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
        feedbacks={proposal.feedbacks.map((f) => ({ id: f.id, content: f.content, createdAt: f.createdAt.toISOString() }))}
        versions={versions.map((v) => ({ id: v.id, version: v.version, status: v.status, committedAt: v.committedAt?.toISOString() ?? null }))}
      />
    </div>
  );
}
