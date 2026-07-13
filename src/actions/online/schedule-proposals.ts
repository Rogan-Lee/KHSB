"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/roles";
import { validateMagicLink } from "@/lib/student-auth";
import { hasGatePass, reportExpiresAt } from "@/lib/token-auth";

export type AttendanceSlot = { dayOfWeek: number; startTime: string; endTime: string };
export type OutingSlot = { dayOfWeek: number; outStart: string; outEnd: string; reason?: string | null };

function deriveClassGroup(dayCount: number): string | null {
  if (dayCount === 0) return null;
  if (dayCount >= 4) return "정규반";
  return "선택반";
}

function sanitizeAttendance(rows: unknown): AttendanceSlot[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r): r is AttendanceSlot =>
      !!r && typeof r === "object" &&
      typeof (r as AttendanceSlot).dayOfWeek === "number" &&
      typeof (r as AttendanceSlot).startTime === "string" &&
      typeof (r as AttendanceSlot).endTime === "string")
    .map((r) => ({ dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime }));
}

function sanitizeOutings(rows: unknown): OutingSlot[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r): r is OutingSlot =>
      !!r && typeof r === "object" &&
      typeof (r as OutingSlot).dayOfWeek === "number" &&
      typeof (r as OutingSlot).outStart === "string" &&
      typeof (r as OutingSlot).outEnd === "string")
    .map((r) => ({ dayOfWeek: r.dayOfWeek, outStart: r.outStart, outEnd: r.outEnd, reason: r.reason ?? null }));
}

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
 * 커밋 — 승인된 제안안을 AttendanceSchedule/OutingSchedule 에 반영.
 * 직전 상태를 prev*Snapshot 에 저장(롤백용), 기존 COMMITTED 는 SUPERSEDED.
 */
export async function commitScheduleProposal(id: string) {
  const sessionUser = await auth();
  requireStaff(sessionUser?.user?.role);

  const proposal = await prisma.scheduleProposal.findUnique({ where: { id } });
  if (!proposal) throw new Error("스케줄 제안을 찾을 수 없습니다");
  if (proposal.status !== "APPROVED") throw new Error("학부모 승인 후에만 반영할 수 있습니다");

  const studentId = proposal.studentId;
  const proposedAttendance = sanitizeAttendance(proposal.proposedAttendance);
  const proposedOutings = sanitizeOutings(proposal.proposedOutings);

  await prisma.$transaction(async (tx) => {
    // 1) 현재 상태 스냅샷
    const [curAtt, curOut] = await Promise.all([
      tx.attendanceSchedule.findMany({ where: { studentId }, select: { dayOfWeek: true, startTime: true, endTime: true } }),
      tx.outingSchedule.findMany({ where: { studentId }, select: { dayOfWeek: true, outStart: true, outEnd: true, reason: true } }),
    ]);
    // 2) 입퇴실 일정 교체
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
    // 3) 기존 COMMITTED 는 SUPERSEDED
    await tx.scheduleProposal.updateMany({
      where: { studentId, status: "COMMITTED", id: { not: id } },
      data: { status: "SUPERSEDED" },
    });
    // 4) 이 제안 COMMITTED + 스냅샷 저장
    await tx.scheduleProposal.update({
      where: { id },
      data: {
        status: "COMMITTED",
        committedById: sessionUser!.user!.id,
        committedAt: new Date(),
        prevAttendanceSnapshot: curAtt,
        prevOutingSnapshot: curOut,
      },
    });
  });

  revalidatePath("/attendance");
  revalidatePath(`/students/${studentId}`);
  revalidatePath(`/online/schedules/${id}`);
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
