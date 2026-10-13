import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { revokeNetworkPolicy } from "@/lib/network-adapter";
import { selectExpiredNetworkRequests } from "@/lib/network-revoke";
import { notifySlack } from "@/lib/slack";

export const dynamic = "force-dynamic";

/**
 * 하루 1회 실행 — 승인돼 정책에 반영(appliedAt != null)됐지만 사용 종료 시각(endAt)이 지난
 * 네트워크 신청을 정리한다.
 *
 * 실제 차단 복구는 이 크론을 기다리지 않는다: 일시 허용은 종료 시각이 지나면 정책 계산에서
 * 저절로 빠지고 시설 장비가 다음 확인 때 반영한다 (src/lib/access-control). 여기서는 신청 기록만 맞춘다.
 *
 * 마킹 방식(스키마 변경 없이): 정리 후 appliedAt=null 로 되돌린다.
 * "status=APPROVED && appliedAt=null && endAt 지남" = 정리 완료. revokeNetworkPolicy 는 여러 번 불러도 안전하다.
 */
export async function GET(request: NextRequest) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;

  const candidates = await prisma.networkRequest.findMany({
    where: { status: "APPROVED", appliedAt: { not: null } },
    include: { student: { select: { name: true } } },
  });
  const expired = selectExpiredNetworkRequests(candidates, new Date());

  for (const req of expired) {
    await revokeNetworkPolicy(req);
    await prisma.networkRequest.update({
      where: { id: req.id },
      data: { appliedAt: null },
    });
  }

  if (expired.length > 0) {
    // fire-and-forget — 실패해도 회수 로직 미차단
    notifySlack(
      `📵 [네트워크 회수] 만료된 신청 ${expired.length}건 회수 — ${expired
        .map((r) => r.student.name)
        .join(", ")}`,
    );
  }

  return NextResponse.json({ ok: true, revokedCount: expired.length });
}
