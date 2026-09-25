import { z } from "zod";

import { MobileApiError } from "@/lib/mobile-auth";
import { sanitizeAttendance, sanitizeOutings } from "@/lib/online/schedule-commit";
import {
  approveScheduleProposalCore,
  rejectScheduleProposalCore,
} from "@/lib/online/schedule-parent-decision";
import { parseMobileBody, type ParentChildRef } from "@/lib/mobile-parent-services";
import { prisma } from "@/lib/prisma";
import { notifySlack } from "@/lib/slack";

// 학부모 앱 — 등원 스케줄 확인·승인. 웹 /r/schedule/[token] 과 같은 규칙(schedule-parent-decision 공용).
// 웹은 토큰 게이트(본인 확인 쿠키), 앱은 ParentLink 로 본인 확인을 대신한다.

const RECENT_DAYS = 45;

const rejectSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "수정이 필요한 부분을 알려 주세요")
    .max(1000, "의견은 1000자까지 쓸 수 있어요"),
});

type ProposalRow = {
  id: string;
  version: number;
  status: string;
  proposedAttendance: unknown;
  proposedOutings: unknown;
  adminNote: string | null;
  scheduledFor: Date | null;
  approvedAt: Date | null;
  committedAt: Date | null;
  updatedAt: Date;
  feedbacks: { id: string; content: string; createdAt: Date }[];
};

function toView(p: ProposalRow) {
  return {
    id: p.id,
    version: p.version,
    status: p.status,
    attendance: sanitizeAttendance(p.proposedAttendance),
    outings: sanitizeOutings(p.proposedOutings),
    adminNote: p.adminNote,
    scheduledFor: p.scheduledFor ? p.scheduledFor.toISOString().slice(0, 10) : null,
    approvedAt: p.approvedAt?.toISOString() ?? null,
    committedAt: p.committedAt?.toISOString() ?? null,
    updatedAt: p.updatedAt.toISOString(),
    feedbacks: p.feedbacks.map((f) => ({
      id: f.id,
      content: f.content,
      createdAt: f.createdAt.toISOString(),
    })),
  };
}

const proposalSelect = {
  id: true,
  version: true,
  status: true,
  proposedAttendance: true,
  proposedOutings: true,
  adminNote: true,
  scheduledFor: true,
  approvedAt: true,
  committedAt: true,
  updatedAt: true,
  feedbacks: {
    orderBy: { createdAt: "desc" as const },
    take: 10,
    select: { id: true, content: true, createdAt: true },
  },
};

export async function getParentSchedule(child: ParentChildRef) {
  const now = new Date();
  const since = new Date(now.getTime() - RECENT_DAYS * 24 * 60 * 60 * 1000);

  const [attendance, outings, pending, latest] = await Promise.all([
    prisma.attendanceSchedule.findMany({
      where: { studentId: child.id },
      select: { dayOfWeek: true, startTime: true, endTime: true },
    }),
    prisma.outingSchedule.findMany({
      where: { studentId: child.id },
      select: { dayOfWeek: true, outStart: true, outEnd: true, reason: true },
    }),
    // 승인 대기 — 운영진이 학부모에게 보낸(PROPOSED) 회수·만료되지 않은 최신 제안
    prisma.scheduleProposal.findFirst({
      where: {
        studentId: child.id,
        status: "PROPOSED",
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { version: "desc" },
      select: proposalSelect,
    }),
    // 최근 처리된 제안 (승인·반영·수정요청) — 학부모에게 공유된 것만(expiresAt 설정됨)
    prisma.scheduleProposal.findFirst({
      where: {
        studentId: child.id,
        status: { in: ["APPROVED", "COMMITTED", "REJECTED"] },
        revokedAt: null,
        expiresAt: { not: null },
        updatedAt: { gte: since },
      },
      orderBy: { updatedAt: "desc" },
      select: proposalSelect,
    }),
  ]);

  return {
    studentName: child.name,
    current: {
      attendance: sanitizeAttendance(attendance),
      outings: sanitizeOutings(outings),
    },
    pending: pending ? toView(pending) : null,
    latest: latest && (!pending || latest.id !== pending.id) ? toView(latest) : null,
  };
}

async function loadOwnedProposal(children: ParentChildRef[], proposalId: string) {
  const proposal = await prisma.scheduleProposal.findUnique({
    where: { id: proposalId },
    select: { id: true, studentId: true, status: true, revokedAt: true, expiresAt: true },
  });
  const child = proposal ? children.find((c) => c.id === proposal.studentId) : undefined;
  // 남의 자녀 제안은 존재 여부도 알리지 않는다
  if (!proposal || !child) throw new MobileApiError("스케줄을 찾을 수 없습니다", 404);
  if (proposal.revokedAt) {
    throw new MobileApiError("운영진이 회수한 스케줄이에요. 새 안내를 기다려 주세요", 409);
  }
  return { proposal, child };
}

export async function approveParentSchedule(children: ParentChildRef[], proposalId: string) {
  const { proposal, child } = await loadOwnedProposal(children, proposalId);
  if (proposal.status !== "PROPOSED") {
    throw new MobileApiError("이미 처리된 스케줄이에요", 409);
  }
  if (proposal.expiresAt && proposal.expiresAt <= new Date()) {
    throw new MobileApiError("확인 기한이 지났어요. 운영진에게 문의해 주세요", 409);
  }
  await approveScheduleProposalCore(proposal.id);
  notifySlack(`✅ [등원 스케줄 승인] ${child.name} 학부모가 앱에서 등원 스케줄을 승인했습니다.`);
  return { ok: true };
}

export async function rejectParentSchedule(
  children: ParentChildRef[],
  proposalId: string,
  input: unknown,
) {
  const body = parseMobileBody(rejectSchema, input);
  const { proposal, child } = await loadOwnedProposal(children, proposalId);
  // 웹과 같이: 승인 전이면 반려, 반영 뒤면 의견만 남긴다
  if (!["PROPOSED", "APPROVED", "COMMITTED"].includes(proposal.status)) {
    throw new MobileApiError("이미 처리된 스케줄이에요", 409);
  }
  const result = await rejectScheduleProposalCore(proposal.id, body.content);
  notifySlack(
    `✏️ [등원 스케줄 수정요청] ${child.name} 학부모 (앱): ${body.content.slice(0, 300)}\n_/online/schedules/${proposal.id} 에서 확인_`,
  );
  return result;
}
