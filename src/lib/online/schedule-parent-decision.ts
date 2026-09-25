import { revalidatePath } from "next/cache";

import { MobileApiError } from "@/lib/mobile-auth";
import { applyProposalCommit } from "@/lib/online/schedule-commit";
import { prisma } from "@/lib/prisma";
import { todayKST } from "@/lib/utils";

// 등원 스케줄 제안 — 학부모 승인/수정요청 핵심 로직 (제안 ID 기준).
// 본인 확인은 호출 측 책임: 웹 서버 액션(src/actions/online/schedule-proposals.ts)은 토큰 게이트,
// 학부모 앱(src/lib/mobile-parent-schedule.ts)은 ParentLink.
// 오류는 MobileApiError(Error 하위 클래스, 한국어 메시지 + HTTP 상태)로 던진다.

/** 학부모 승인 — APPROVED. 실행 예정일이 이미 도래했으면 즉시 반영. */
export async function approveScheduleProposalCore(proposalId: string) {
  const proposal = await prisma.scheduleProposal.findUnique({
    where: { id: proposalId },
    select: { id: true, status: true, scheduledFor: true },
  });
  if (!proposal) throw new MobileApiError("스케줄을 찾을 수 없습니다", 404);
  if (proposal.status !== "PROPOSED") throw new MobileApiError("승인할 수 없는 상태입니다", 409);

  await prisma.scheduleProposal.update({
    where: { id: proposal.id },
    data: { status: "APPROVED", approvedAt: new Date() },
  });

  // 실행 예정일이 오늘 이하면(검토 지연 등) cron 을 기다리지 않고 즉시 반영. 미래면 예정일 cron 이 처리.
  const todayStr = todayKST().toISOString().slice(0, 10);
  if (proposal.scheduledFor && proposal.scheduledFor.toISOString().slice(0, 10) <= todayStr) {
    await applyProposalCommit(proposal.id, null);
  }
  revalidatePath("/online/schedules");
  return { ok: true };
}

/**
 * 학부모 반려/수정 요청 — 승인 전(PROPOSED)이면 REJECTED + 피드백,
 * 이미 반영/처리된 뒤면 상태 유지하고 피드백만 남긴다.
 */
export async function rejectScheduleProposalCore(proposalId: string, content: string) {
  const proposal = await prisma.scheduleProposal.findUnique({
    where: { id: proposalId },
    select: { id: true, status: true },
  });
  if (!proposal) throw new MobileApiError("스케줄을 찾을 수 없습니다", 404);

  const text = content.trim();
  if (!text) throw new MobileApiError("의견을 입력해 주세요", 400);

  await prisma.$transaction([
    ...(proposal.status === "PROPOSED"
      ? [prisma.scheduleProposal.update({ where: { id: proposal.id }, data: { status: "REJECTED" } })]
      : []),
    prisma.scheduleProposalFeedback.create({ data: { proposalId: proposal.id, content: text } }),
  ]);
  revalidatePath("/online/schedules");
  return { ok: true, status: proposal.status === "PROPOSED" ? "REJECTED" : proposal.status };
}
