import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { revokeNetworkPolicy } from "@/lib/network-adapter";
import { selectExpiredNetworkRequests } from "@/lib/network-revoke";
import { notifySlack } from "@/lib/slack";

export const dynamic = "force-dynamic";

/**
 * 15분마다 실행 — 승인 후 장비에 적용(appliedAt != null)됐지만
 * 사용 종료 시각(endAt)이 지난 네트워크 신청을 어댑터로 회수한다.
 *
 * 마킹 방식(스키마 변경 없이): 회수 후 appliedAt=null 로 되돌린다.
 * decideNetworkRequest 의 거절 전환 회수 처리와 동일한 컨벤션으로,
 * "status=APPROVED && appliedAt=null" = 회수 완료 상태를 뜻한다.
 * appliedAt != null 조건으로 걸러지므로 매 실행 같은 건을 다시 잡지 않으며,
 * 재실행/중복 호출 대비로 revokeNetworkPolicy 어댑터는 멱등이어야 한다(현재 no-op이라 안전).
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
