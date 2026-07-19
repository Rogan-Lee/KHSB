"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma";
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

/** 검토 큐 — SUBMITTED/PROPOSED 상태 제안 목록. sort: 최신순(기본)/이름순/제출순. */
export type ProposalSort = "recent" | "name" | "submitted";
export async function listScheduleProposalsForReview(sort: ProposalSort = "recent") {
  const sessionUser = await auth();
  requireStaff(sessionUser?.user?.role);
  const orderBy: Prisma.ScheduleProposalOrderByWithRelationInput =
    sort === "name" ? { student: { name: "asc" } } :
    sort === "submitted" ? { createdAt: "asc" } :
    { updatedAt: "desc" };
  const rows = await prisma.scheduleProposal.findMany({
    where: { status: { in: ["SUBMITTED", "PROPOSED", "APPROVED", "REJECTED"] } },
    orderBy,
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

/**
 * 학부모에게 전송 — PROPOSED + 실행 예정일(필수) + 토큰 만료 설정. 학부모 승인 링크 반환.
 * 학부모는 "이 스케줄을 언제부터 적용하는지"까지 보고 승인. 승인 시점에 예정일이
 * 이미 도래했으면 즉시, 미래면 해당일 00시(KST) cron 이 자동 반영.
 */
export async function sendProposalToParent(id: string, effectiveDate: string) {
  const sessionUser = await auth();
  requireStaff(sessionUser?.user?.role);

  const todayStr = todayKST().toISOString().slice(0, 10);
  if (!effectiveDate) throw new Error("실행 예정일을 지정해 주세요");
  if (effectiveDate < todayStr) throw new Error("실행 예정일은 오늘 이후로 지정해 주세요");

  const updated = await prisma.scheduleProposal.update({
    where: { id },
    data: {
      status: "PROPOSED",
      scheduledFor: new Date(effectiveDate),
      expiresAt: reportExpiresAt(),
      revokedAt: null,
    },
    select: { token: true },
  });
  revalidatePath(`/online/schedules/${id}`);
  revalidatePath("/online/schedules");
  return { token: updated.token };
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

/**
 * 우선 반영 — 학부모 승인을 기다리지 않고 운영진이 직접 확인·반영.
 * effectiveDate 미지정 또는 오늘 이하면 즉시 반영, 미래면 예정일 cron 이 처리.
 * 학부모는 반영 후에도 링크로 피드백(수정 요청)을 남길 수 있다.
 */
export async function commitProposalByAdmin(id: string, effectiveDate?: string) {
  const sessionUser = await auth();
  requireStaff(sessionUser?.user?.role);

  const proposal = await prisma.scheduleProposal.findUnique({ where: { id }, select: { status: true } });
  if (!proposal) throw new Error("스케줄 제안을 찾을 수 없습니다");
  if (["COMMITTED", "SUPERSEDED", "CANCELLED"].includes(proposal.status)) throw new Error("이미 처리된 제안입니다");

  const todayStr = todayKST().toISOString().slice(0, 10);
  if (effectiveDate && effectiveDate < todayStr) throw new Error("실행 예정일은 오늘 이후로 지정해 주세요");
  const scheduledFor = effectiveDate ? new Date(effectiveDate) : null;

  await prisma.scheduleProposal.update({
    where: { id },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
      reviewedById: sessionUser!.user!.id,
      reviewedAt: new Date(),
      scheduledFor,
      expiresAt: reportExpiresAt(), // 반영 후 학부모 피드백 링크 유지
      revokedAt: null,
    },
  });

  if (!scheduledFor || scheduledFor.toISOString().slice(0, 10) <= todayStr) {
    await applyProposalCommit(id, sessionUser!.user!.id);
  }
  revalidatePath(`/online/schedules/${id}`);
  revalidatePath("/online/schedules");
  return { ok: true };
}

/** 중복/오류 제안 삭제 — 반영 전 제안만. (COMMITTED 는 되돌리기 후 삭제) */
export async function deleteScheduleProposal(id: string) {
  const sessionUser = await auth();
  requireStaff(sessionUser?.user?.role);
  const proposal = await prisma.scheduleProposal.findUnique({ where: { id }, select: { status: true } });
  if (!proposal) throw new Error("스케줄 제안을 찾을 수 없습니다");
  if (proposal.status === "COMMITTED") throw new Error("반영된 제안은 삭제할 수 없습니다. 되돌리기를 먼저 진행해 주세요");
  await prisma.scheduleProposal.delete({ where: { id } });
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

/** 학부모 승인 — APPROVED. 게이트 통과 필요. 실행 예정일이 이미 도래했으면 즉시 반영. */
export async function approveScheduleProposal(token: string) {
  const proposal = await prisma.scheduleProposal.findUnique({ where: { token }, select: { id: true, studentId: true, status: true, scheduledFor: true } });
  if (!proposal) throw new Error("스케줄을 찾을 수 없습니다");
  const passed = await hasGatePass("PARENT", token, proposal.studentId);
  if (!passed) throw new Error("본인 확인이 필요합니다");
  if (proposal.status !== "PROPOSED") throw new Error("승인할 수 없는 상태입니다");

  await prisma.scheduleProposal.update({ where: { id: proposal.id }, data: { status: "APPROVED", approvedAt: new Date() } });

  // 실행 예정일이 오늘 이하면(검토 지연 등) cron 을 기다리지 않고 즉시 반영. 미래면 예정일 cron 이 처리.
  const todayStr = todayKST().toISOString().slice(0, 10);
  if (proposal.scheduledFor && proposal.scheduledFor.toISOString().slice(0, 10) <= todayStr) {
    await applyProposalCommit(proposal.id, null);
  }
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

  // 승인 전(PROPOSED)이면 반려 처리, 이미 반영/처리된 뒤면 상태 유지하고 피드백만 남긴다.
  await prisma.$transaction([
    ...(proposal.status === "PROPOSED"
      ? [prisma.scheduleProposal.update({ where: { id: proposal.id }, data: { status: "REJECTED" } })]
      : []),
    prisma.scheduleProposalFeedback.create({ data: { proposalId: proposal.id, content: text } }),
  ]);
  revalidatePath("/online/schedules");
  return { ok: true };
}
