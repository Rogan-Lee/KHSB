import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { todayKST } from "@/lib/utils";

export type AttendanceSlot = { dayOfWeek: number; startTime: string; endTime: string };
export type OutingSlot = { dayOfWeek: number; outStart: string; outEnd: string; reason?: string | null };

export function deriveClassGroup(dayCount: number): string | null {
  if (dayCount === 0) return null;
  if (dayCount >= 4) return "정규반";
  return "선택반";
}

export function sanitizeAttendance(rows: unknown): AttendanceSlot[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r): r is AttendanceSlot =>
      !!r && typeof r === "object" &&
      typeof (r as AttendanceSlot).dayOfWeek === "number" &&
      typeof (r as AttendanceSlot).startTime === "string" &&
      typeof (r as AttendanceSlot).endTime === "string")
    .map((r) => ({ dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime }));
}

export function sanitizeOutings(rows: unknown): OutingSlot[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r): r is OutingSlot =>
      !!r && typeof r === "object" &&
      typeof (r as OutingSlot).dayOfWeek === "number" &&
      typeof (r as OutingSlot).outStart === "string" &&
      typeof (r as OutingSlot).outEnd === "string")
    .map((r) => ({ dayOfWeek: r.dayOfWeek, outStart: r.outStart, outEnd: r.outEnd, reason: r.reason ?? null }));
}

/**
 * 커밋 코어 — 승인된 제안안을 AttendanceSchedule/OutingSchedule 에 반영.
 * 직전 상태를 prev*Snapshot 에 저장(롤백용), 기존 COMMITTED 는 SUPERSEDED.
 * 인증 없음 — 서버 액션(즉시)과 cron(예약일 도래) 양쪽에서 재사용.
 */
export async function applyProposalCommit(id: string, committedById: string | null) {
  const proposal = await prisma.scheduleProposal.findUnique({ where: { id } });
  if (!proposal) throw new Error("스케줄 제안을 찾을 수 없습니다");
  if (proposal.status !== "APPROVED") throw new Error("학부모 승인 후에만 반영할 수 있습니다");

  const studentId = proposal.studentId;
  const proposedAttendance = sanitizeAttendance(proposal.proposedAttendance);
  const proposedOutings = sanitizeOutings(proposal.proposedOutings);

  await prisma.$transaction(async (tx) => {
    const [curAtt, curOut] = await Promise.all([
      tx.attendanceSchedule.findMany({ where: { studentId }, select: { dayOfWeek: true, startTime: true, endTime: true } }),
      tx.outingSchedule.findMany({ where: { studentId }, select: { dayOfWeek: true, outStart: true, outEnd: true, reason: true } }),
    ]);
    await tx.attendanceSchedule.deleteMany({ where: { studentId } });
    if (proposedAttendance.length > 0) {
      await tx.attendanceSchedule.createMany({ data: proposedAttendance.map((s) => ({ ...s, studentId })) });
    }
    await tx.outingSchedule.deleteMany({ where: { studentId } });
    if (proposedOutings.length > 0) {
      await tx.outingSchedule.createMany({ data: proposedOutings.map((o) => ({ studentId, dayOfWeek: o.dayOfWeek, outStart: o.outStart, outEnd: o.outEnd, reason: o.reason ?? null })) });
    }
    const dayCount = new Set(proposedAttendance.map((s) => s.dayOfWeek)).size;
    await tx.student.update({ where: { id: studentId }, data: { classGroup: deriveClassGroup(dayCount) } });
    await tx.scheduleProposal.updateMany({
      where: { studentId, status: "COMMITTED", id: { not: id } },
      data: { status: "SUPERSEDED" },
    });
    await tx.scheduleProposal.update({
      where: { id },
      data: {
        status: "COMMITTED",
        committedById,
        committedAt: new Date(),
        prevAttendanceSnapshot: curAtt,
        prevOutingSnapshot: curOut,
      },
    });
  });

  revalidatePath("/attendance");
  revalidatePath(`/students/${studentId}`);
  revalidatePath(`/online/schedules/${id}`);
  return studentId;
}

/** cron 전용 — 실행 예정일이 도래한 승인 제안을 반영. */
export async function applyDueScheduledProposals() {
  const due = await prisma.scheduleProposal.findMany({
    where: { status: "APPROVED", scheduledFor: { not: null, lte: todayKST() } },
    orderBy: { scheduledFor: "asc" },
    select: { id: true },
  });
  let applied = 0;
  const errors: { id: string; error: string }[] = [];
  for (const p of due) {
    try {
      await applyProposalCommit(p.id, null);
      applied++;
    } catch (e) {
      errors.push({ id: p.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { found: due.length, applied, errors };
}
