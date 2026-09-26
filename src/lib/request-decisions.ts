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
const MAX_NAP_NOTE_LEN = 300;

/** 웹 액션은 note 를 검증 없이 넘기므로 코어에서 문자열·길이를 정리한다 */
function cleanNote(note: unknown, max: number): string | null {
  if (typeof note !== "string") return null;
  const trimmed = note.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

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
      note: cleanNote(note, MAX_NAP_NOTE_LEN),
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
  // 같은 학생의 승인 동시 처리로 잔액이 초과 차감되지 않게, 학생 단위 트랜잭션 락 안에서
  // 상태·잔액을 다시 읽고 조건부로 갱신한다 (pg_advisory_xact_lock — 커밋/롤백 시 자동 해제).
  return prisma.$transaction(async (tx) => {
    const found = await tx.rewardRedemption.findUnique({
      where: { id },
      select: { studentId: true },
    });
    if (!found) throw new MobileApiError("신청을 찾을 수 없습니다", 404);
    await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${`reward-redemption:${found.studentId}`}))) AS l`;

    const redemption = await tx.rewardRedemption.findUnique({ where: { id } });
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
        tx.meritDemerit.findMany({
          where: { studentId: redemption.studentId },
          select: { type: true, points: true },
        }),
        tx.rewardRedemption.findMany({
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

    return tx.rewardRedemption.update({
      where: { id },
      data: {
        status: nextStatus,
        note: cleanNote(note, MAX_REDEMPTION_NOTE_LEN) ?? redemption.note,
        decidedById: decider.id,
        decidedByName: decider.name ?? null,
        decidedAt: new Date(),
      },
      select: { id: true, studentId: true, itemName: true, points: true, status: true },
    });
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
