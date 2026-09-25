// 학생 신청 승인/거절 핵심 로직 — 쪽잠 · 네트워크 · 포인트 교환 · 모의고사 신청.
// 웹 서버 액션(src/actions/{nap,network-requests,rewards,exam-application}.ts)과
// 모바일 승인함 API(src/lib/mobile-staff-approvals.ts)가 같이 쓴다.
// 호출 측이 직원 권한을 먼저 검증하고, revalidatePath 도 호출 측 책임.

import type { ExamApplicationStatus, RedemptionStatus } from "@/generated/prisma/enums";
import { MobileApiError } from "@/lib/mobile-auth";
import { applyNetworkPolicy, revokeNetworkPolicy } from "@/lib/network-adapter";
import { calcPointBalance } from "@/lib/points";
import { prisma } from "@/lib/prisma";

/** 처리한 직원 (이름은 스냅샷으로 저장) */
export type Decider = { id: string; name: string | null };

const MAX_REDEMPTION_NOTE_LEN = 300;

/** 쪽잠 승인/거절 — 결정자 이름 스냅샷 + 메모. */
export async function decideNapRequest(
  id: string,
  decision: "approve" | "reject",
  decider: Decider,
  note?: string | null,
) {
  return prisma.napRequest.update({
    where: { id },
    data: {
      status: decision === "approve" ? "APPROVED" : "REJECTED",
      note: note?.trim() || null,
      decidedById: decider.id,
      decidedByName: decider.name ?? null,
      decidedAt: new Date(),
    },
    select: { id: true, studentId: true, startTime: true, durationMin: true, status: true },
  });
}

/** 네트워크 신청 승인/거절 — 승인 시 어댑터로 정책 적용, 거절 전환 시 회수. */
export async function decideNetworkRequest(
  id: string,
  decision: "approve" | "reject",
  decider: Decider,
) {
  const req = await prisma.networkRequest.findUnique({ where: { id } });
  if (!req) throw new MobileApiError("신청을 찾을 수 없습니다", 404);

  let appliedAt = req.appliedAt;
  if (decision === "approve") {
    appliedAt = (await applyNetworkPolicy(req)).appliedAt;
  } else if (req.status === "APPROVED" && req.appliedAt) {
    await revokeNetworkPolicy(req);
    appliedAt = null;
  }

  return prisma.networkRequest.update({
    where: { id },
    data: {
      status: decision === "approve" ? "APPROVED" : "REJECTED",
      appliedAt,
      decidedById: decider.id,
      decidedByName: decider.name ?? null,
      decidedAt: new Date(),
    },
    select: { id: true, studentId: true, kind: true, target: true, status: true },
  });
}

/** 포인트 교환 처리 — 승인/거절(대기중만), 지급(승인됨만). 승인 시 잔액 재검증. */
export async function decideRewardRedemption(
  id: string,
  action: "approve" | "reject" | "fulfill",
  decider: Decider,
  note?: string | null,
) {
  const redemption = await prisma.rewardRedemption.findUnique({ where: { id } });
  if (!redemption) throw new MobileApiError("신청을 찾을 수 없습니다", 404);

  let nextStatus: RedemptionStatus;
  if (action === "approve" || action === "reject") {
    if (redemption.status !== "PENDING") {
      throw new MobileApiError("대기중인 신청만 처리할 수 있습니다", 409);
    }
    nextStatus = action === "approve" ? "APPROVED" : "REJECTED";
  } else {
    if (redemption.status !== "APPROVED") {
      throw new MobileApiError("승인된 신청만 지급 처리할 수 있습니다", 409);
    }
    nextStatus = "FULFILLED";
  }

  if (action === "approve") {
    // 승인 시점 잔액 재검증 (이 신청은 아직 PENDING이므로 차감 전)
    const [merits, redemptions] = await Promise.all([
      prisma.meritDemerit.findMany({
        where: { studentId: redemption.studentId },
        select: { type: true, points: true },
      }),
      prisma.rewardRedemption.findMany({
        where: { studentId: redemption.studentId },
        select: { status: true, points: true },
      }),
    ]);
    const { balance } = calcPointBalance({ merits, redemptions });
    if (balance < redemption.points) {
      throw new MobileApiError(
        `포인트 잔액이 부족합니다 (잔액 ${balance}점 / 필요 ${redemption.points}점)`,
        400,
      );
    }
  }

  return prisma.rewardRedemption.update({
    where: { id },
    data: {
      status: nextStatus,
      note: note?.trim() ? note.trim().slice(0, MAX_REDEMPTION_NOTE_LEN) : redemption.note,
      decidedById: decider.id,
      decidedByName: decider.name ?? null,
      decidedAt: new Date(),
    },
    select: { id: true, studentId: true, itemName: true, points: true, status: true },
  });
}

/** 모의고사 신청 상태 변경 — 확정(CONFIRMED) / 반려(CANCELLED) / 대기(PENDING). */
export async function updateExamApplicationStatus(
  id: string,
  status: ExamApplicationStatus,
  deciderId: string,
) {
  return prisma.examApplication.update({
    where: { id },
    data: {
      status,
      confirmedAt: status === "CONFIRMED" ? new Date() : null,
      confirmedById: status === "CONFIRMED" ? deciderId : null,
    },
    select: {
      id: true,
      sessionId: true,
      studentId: true,
      status: true,
      session: { select: { title: true } },
    },
  });
}
