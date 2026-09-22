// ponytail: no-op adapter — AdGuard Home 등 장비 연동 확정 시 이 두 함수만 구현
import type { NetworkRequest } from "@/generated/prisma";

/** 승인된 네트워크 신청을 장비에 적용. 현재는 로그만 남기고 적용 시각을 반환. */
export async function applyNetworkPolicy(req: NetworkRequest): Promise<{ appliedAt: Date }> {
  console.log(
    `[network-adapter] apply (no-op) id=${req.id} kind=${req.kind} target=${req.target ?? "-"} ${req.startAt.toISOString()}~${req.endAt.toISOString()}`
  );
  return { appliedAt: new Date() };
}

/** 적용된 정책 회수. 현재는 로그만. */
export async function revokeNetworkPolicy(req: NetworkRequest): Promise<void> {
  console.log(`[network-adapter] revoke (no-op) id=${req.id} kind=${req.kind}`);
}
