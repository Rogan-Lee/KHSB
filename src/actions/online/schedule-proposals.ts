"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/roles";
import { validateMagicLink } from "@/lib/student-auth";
import { hasGatePass, reportExpiresAt } from "@/lib/token-auth";
import { todayKST } from "@/lib/utils";
import {
  sanitizeAttendance,
  sanitizeOutings,
  deriveClassGroup,
  applyProposalCommit,
  type AttendanceSlot,
  type OutingSlot,
} from "@/lib/online/schedule-commit";

// ───────────────────── 학생 (매직링크 토큰) ─────────────────────

/** 학생이 주간 등하원/외출 스케줄을 제출. 새 버전으로 기록. */
export async function submitScheduleProposal(params: {
  studentToken: string;
  attendance: AttendanceSlot[];
  outings: OutingSlot[];
  memo?: string;
}) {
  const session = await validateMagicLink(params.studentToken);
  if (!session) throw new Error("인증이 만료되었습니다");

  const attendance = sanitizeAttendance(params.attendance);
  const outings = sanitizeOutings(params.outings);

  const last = await prisma.scheduleProposal.findFirst({
    where: { studentId: session.student.id },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (last?.version ?? 0) + 1;

  const created = await prisma.scheduleProposal.create({
    data: {
      studentId: session.student.id,
      version,
      status: "SUBMITTED",
      submittedAttendance: attendance,
      submittedOutings: outings,
      studentMemo: params.memo?.trim() || null,
      // 제안 초기값 = 제출값 (운영진이 검토/수정)
      proposedAttendance: attendance,
      proposedOutings: outings,
    },
  });
  revalidatePath("/online/schedules");
  return { id: created.id, version };
}

/** 학생 포털 — 본인 제출 이력. */
export async function listMyScheduleProposals(studentToken: string) {
  const session = await validateMagicLink(studentToken);
  if (!session) throw new Error("인증이 만료되었습니다");
  const rows = await prisma.scheduleProposal.findMany({
    where: { studentId: session.student.id },
    orderBy: { version: "desc" },
    select: { id: true, version: true, status: true, createdAt: true, committedAt: true },
  });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), committedAt: r.committedAt?.toISOString() ?? null }));
}

// ───────────────────── 운영진 (Clerk, 원장) ─────────────────────

/** 검토 큐 — SUBMITTED/PROPOSED 상태 제안 목록. */
export async function listScheduleProposalsForReview() {
  const sessionUser = await auth();
  requireStaff(sessionUser?.user?.role);
  const rows = await prisma.scheduleProposal.findMany({
    where: { status: { in: ["SUBMITTED", "PROPOSED", "APPROVED", "REJECTED"] } },
    orderBy: { updatedAt: "desc" },
    include: { student: { select: { id: true, name: true, grade: true } }, _count: { select: { feedbacks: true } } },
  });
  return rows;
}

/** 운영진 제안안 수정. */
export async function updateProposedSchedule(
  id: string,
  data: { proposedAttendance: AttendanceSlot[]; proposedOutings: OutingSlot[]; adminNote?: string },
) {
  const sessionUser = await auth();
  requireStaff(sessionUser?.user?.role);
  await prisma.scheduleProposal.update({
    where: { id },
    data: {
      proposedAttendance: sanitizeAttendance(data.proposedAttendance),
      proposedOutings: sanitizeOutings(data.proposedOutings),
      adminNote: data.adminNote?.trim() || null,
      reviewedById: sessionUser!.user!.id,
      reviewedAt: new Date(),
    },
  });
  revalidatePath(`/online/schedules/${id}`);
  return { ok: true };
}

/** 학부모에게 전송 — PROPOSED + 토큰 만료 설정. 학부모 승인 링크 반환. */
export async function sendProposalToParent(id: string) {
  const sessionUser = await auth();
  requireStaff(sessionUser?.user?.role);
  const updated = await prisma.scheduleProposal.update({
    where: { id },
    data: { status: "PROPOSED", expiresAt: reportExpiresAt(), revokedAt: null },
    select: { token: true },
  });
  revalidatePath(`/online/schedules/${id}`);
  revalidatePath("/online/schedules");
  return { token: updated.token };
}

/**
 * 반영 — 즉시 또는 실행 예정일 예약.
 * effectiveDate("YYYY-MM-DD") 가 미래면 예약(APPROVED 유지, scheduledFor 설정)해
 * 해당일 00시(KST) cron 이 자동 반영. 오늘 이하/미지정이면 즉시 반영.
 */
export async function commitScheduleProposal(id: string, effectiveDate?: string | null) {
  const sessionUser = await auth();
  requireStaff(sessionUser?.user?.role);

  const todayStr = todayKST().toISOString().slice(0, 10);
  if (effectiveDate && effectiveDate > todayStr) {
    const proposal = await prisma.scheduleProposal.findUnique({ where: { id }, select: { status: true } });
    if (proposal?.status !== "APPROVED") throw new Error("학부모 승인 후에만 예약할 수 있습니다");
    await prisma.scheduleProposal.update({
      where: { id },
      data: { scheduledFor: new Date(effectiveDate) },
    });
    revalidatePath(`/online/schedules/${id}`);
    revalidatePath("/online/schedules");
    return { scheduled: true as const, scheduledFor: effectiveDate };
  }

  await applyProposalCommit(id, sessionUser!.user!.id);
  revalidatePath("/online/schedules");
  return { scheduled: false as const };
}

/** 실행 예정일 예약 취소 — scheduledFor 해제 (아직 반영 전). */
export async function cancelScheduledCommit(id: string) {
  const sessionUser = await auth();
  requireStaff(sessionUser?.user?.role);
  await prisma.scheduleProposal.update({
    where: { id },
    data: { scheduledFor: null },
  });
  revalidatePath(`/online/schedules/${id}`);
  revalidatePath("/online/schedules");
  return { ok: true };
}

/** 롤백 — 커밋 직전 스냅샷으로 입퇴실 일정 복원. */
export async function rollbackScheduleProposal(id: string) {
  const sessionUser = await auth();
  requireStaff(sessionUser?.user?.role);

  const proposal = await prisma.scheduleProposal.findUnique({ where: { id } });
  if (!proposal) throw new Error("스케줄 제안을 찾을 수 없습니다");
  if (proposal.status !== "COMMITTED") throw new Error("반영된 제안만 되돌릴 수 있습니다");

  const studentId = proposal.studentId;
  const prevAtt = sanitizeAttendance(proposal.prevAttendanceSnapshot);
  const prevOut = sanitizeOutings(proposal.prevOutingSnapshot);

  await prisma.$transaction(async (tx) => {
    await tx.attendanceSchedule.deleteMany({ where: { studentId } });
    if (prevAtt.length > 0) {
      await tx.attendanceSchedule.createMany({ data: prevAtt.map((s) => ({ ...s, studentId })) });
    }
    await tx.outingSchedule.deleteMany({ where: { studentId } });
    if (prevOut.length > 0) {
      await tx.outingSchedule.createMany({ data: prevOut.map((o) => ({ studentId, dayOfWeek: o.dayOfWeek, outStart: o.outStart, outEnd: o.outEnd, reason: o.reason ?? null })) });
    }
    const dayCount = new Set(prevAtt.map((s) => s.dayOfWeek)).size;
    await tx.student.update({ where: { id: studentId }, data: { classGroup: deriveClassGroup(dayCount) } });
    await tx.scheduleProposal.update({ where: { id }, data: { status: "SUPERSEDED" } });
  });

  revalidatePath("/attendance");
  revalidatePath(`/students/${studentId}`);
  revalidatePath(`/online/schedules/${id}`);
  return { ok: true };
}

// ───────────────────── 학부모 (토큰 게이트) ─────────────────────

/** 학부모 승인 — APPROVED. 게이트 통과 필요. */
export async function approveScheduleProposal(token: string) {
  const proposal = await prisma.scheduleProposal.findUnique({ where: { token }, select: { id: true, studentId: true, status: true } });
  if (!proposal) throw new Error("스케줄을 찾을 수 없습니다");
  const passed = await hasGatePass("PARENT", token, proposal.studentId);
  if (!passed) throw new Error("본인 확인이 필요합니다");
  if (proposal.status !== "PROPOSED") throw new Error("승인할 수 없는 상태입니다");

  await prisma.scheduleProposal.update({ where: { id: proposal.id }, data: { status: "APPROVED", approvedAt: new Date() } });
  revalidatePath("/online/schedules");
  return { ok: true };
}

/** 학부모 반려 — REJECTED + 피드백. 게이트 통과 필요. */
export async function rejectScheduleProposal(token: string, content: string) {
  const proposal = await prisma.scheduleProposal.findUnique({ where: { token }, select: { id: true, studentId: true, status: true } });
  if (!proposal) throw new Error("스케줄을 찾을 수 없습니다");
  const passed = await hasGatePass("PARENT", token, proposal.studentId);
  if (!passed) throw new Error("본인 확인이 필요합니다");

  const text = content.trim();
  if (!text) throw new Error("의견을 입력해 주세요");

  await prisma.$transaction([
    prisma.scheduleProposal.update({ where: { id: proposal.id }, data: { status: "REJECTED" } }),
    prisma.scheduleProposalFeedback.create({ data: { proposalId: proposal.id, content: text } }),
  ]);
  revalidatePath("/online/schedules");
  return { ok: true };
}
