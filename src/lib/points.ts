import type { MeritType, RedemptionStatus } from "@/generated/prisma/enums";

/** 환산 표시 상수: 25점 = 10,000원 */
export const POINTS_PER_10000_KRW = 25;

type MeritLike = { type: MeritType; points: number };
type RedemptionLike = { status: RedemptionStatus; points: number };

/** 포인트에서 차감되는 교환 상태 (승인·지급 완료) */
export function isSpentRedemption(status: RedemptionStatus): boolean {
  return status === "APPROVED" || status === "FULFILLED";
}

/**
 * 포인트 잔액 계산. 잔액 원장을 두지 않고 매번 계산한다.
 * 잔액 = Σ(MERIT points) − Σ(DEMERIT points) − Σ(APPROVED/FULFILLED 교환 points)
 */
export function calcPointBalance({
  merits,
  redemptions = [],
}: {
  merits: MeritLike[];
  redemptions?: RedemptionLike[];
}) {
  const merit = merits
    .filter((m) => m.type === "MERIT")
    .reduce((acc, m) => acc + m.points, 0);
  const demerit = merits
    .filter((m) => m.type === "DEMERIT")
    .reduce((acc, m) => acc + m.points, 0);
  const spent = redemptions
    .filter((r) => isSpentRedemption(r.status))
    .reduce((acc, r) => acc + r.points, 0);
  return { merit, demerit, spent, balance: merit - demerit - spent };
}

/** 포인트 → 원화 환산 (표시용, 반올림) */
export function pointsToKrw(points: number): number {
  return Math.round((points / POINTS_PER_10000_KRW) * 10000);
}
