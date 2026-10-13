// 학생 네트워크 사용 신청(승인) ↔ 사용 통제 정책 연결.
// 승인하면 그 학생 기기에 신청 시간 동안만 적용되는 "일시 허용"을 만든다. 시설 장비가 다음 확인 때 받아 가 적용하고,
// 종료 시각이 지나면 정책 계산에서 저절로 빠진다 (src/lib/access-control).
import type { NetworkRequest } from "@/generated/prisma";
import { matchServiceByName, serviceLabel } from "@/lib/access-control/catalog";
import { normalizeDomain } from "@/lib/access-control/domain";
import { ALL_TARGET_LABEL, type ResolvedTarget } from "@/lib/access-control/input";
import { bumpAccessRev, logAccessEvent, type AccessActor } from "@/lib/access-control/store";
import { prisma } from "@/lib/prisma";

type RequestRef = Pick<NetworkRequest, "id" | "kind" | "target" | "studentId" | "startAt" | "endAt">;

// ponytail: 이름·별칭이 정확히 같을 때만 자동 연결 — 못 알아본 신청은 직원이 직접 풀어 준다.
// 신청 화면에서 앱을 목록으로 고르게 바꾸면(앱 새 빌드 필요) 이 추측이 필요 없어진다.
/**
 * 신청 내용을 통제 대상으로 바꾼다. 학생이 자유롭게 적은 앱 이름·주소라 못 알아볼 수 있고, 그때는 null
 * (직원이 통제 화면에서 직접 일시 허용을 만든다).
 */
export function mapRequestTarget(req: Pick<NetworkRequest, "kind" | "target">): ResolvedTarget | null {
  if (req.kind === "WIFI_UNBLOCK") return { targetKind: "ALL", target: "", label: ALL_TARGET_LABEL };
  const domain = normalizeDomain(req.target);
  if (req.kind === "DOMAIN_ALLOW") {
    return domain ? { targetKind: "DOMAIN", target: domain, label: domain } : null;
  }
  const service = matchServiceByName(req.target);
  if (service) return { targetKind: "SERVICE", target: service, label: serviceLabel(service) };
  // 앱 신청인데 주소를 적은 경우
  return domain ? { targetKind: "DOMAIN", target: domain, label: domain } : null;
}

/**
 * 승인된 신청을 정책에 반영한다. appliedAt 이 null 이면 자동 반영하지 못한 것
 * (대상을 못 알아봤거나 저장 실패 — 승인 자체는 막지 않는다).
 */
export async function applyNetworkPolicy(
  req: RequestRef,
  actor?: AccessActor | null,
): Promise<{ appliedAt: Date | null }> {
  const mapped = mapRequestTarget(req);
  if (!mapped) return { appliedAt: null };
  try {
    const data = {
      action: "ALLOW" as const,
      targetKind: mapped.targetKind,
      target: mapped.target,
      label: mapped.label,
      scope: "STUDENT" as const,
      studentId: req.studentId,
      startAt: req.startAt,
      endAt: req.endAt,
      reason: "학생 신청 승인",
      createdById: actor?.id ?? null,
      createdByName: actor?.name ?? null,
    };
    await prisma.accessOverride.upsert({
      where: { networkRequestId: req.id },
      create: { ...data, networkRequestId: req.id },
      update: { ...data, cancelledAt: null, cancelledByName: null },
    });
    await bumpAccessRev();
    await logAccessEvent("REQUEST_APPROVED", `학생 신청 승인 — ${mapped.label} 일시 허용`, actor ?? null, req.studentId);
    return { appliedAt: new Date() };
  } catch (e) {
    console.error(`[network-adapter] apply failed id=${req.id}`, e);
    return { appliedAt: null };
  }
}

/** 반영된 일시 허용 회수 (승인 → 거절 전환, 만료 정리). 여러 번 불러도 안전하다. */
export async function revokeNetworkPolicy(req: Pick<RequestRef, "id">, actor?: AccessActor | null): Promise<void> {
  try {
    const now = new Date();
    const { count } = await prisma.accessOverride.updateMany({
      // 이미 끝난 것은 정책에 영향이 없으므로 그대로 둔다 (기록 보존)
      where: { networkRequestId: req.id, cancelledAt: null, endAt: { gt: now } },
      data: { cancelledAt: now, cancelledByName: actor?.name ?? null },
    });
    if (count > 0) await bumpAccessRev();
  } catch (e) {
    console.error(`[network-adapter] revoke failed id=${req.id}`, e);
  }
}
