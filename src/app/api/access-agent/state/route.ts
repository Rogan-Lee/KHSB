import { NextRequest, NextResponse } from "next/server";

import { MANAGED_BEGIN, MANAGED_CLIENT_PREFIX, MANAGED_CLIENT_TAG, MANAGED_END } from "@/lib/access-control/adguard";
import {
  AGENT_POLL_SECONDS,
  AGENT_STALE_SECONDS,
  authenticateAgentWithRev,
  buildDesired,
  loadPolicyInputs,
  recordAgentHeartbeat,
} from "@/lib/access-control/store";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * 시설 장비가 30초마다 부른다 — 지금 적용해야 할 AdGuard Home 설정(규칙·기기)을 돌려준다.
 * 장비가 가진 변경 번호(rev)가 그대로이고 다음 변경 시각(until) 전이면 계산 없이 unchanged 만 답한다
 * (이때 DB 는 쿼리 한 번, 생존 신호 기록은 1분에 한 번).
 * 장비는 이 호출에 적용한 버전(applied)·오류(err)·서비스 목록 해시(ch)를 실어 보낸다.
 * 인증: Authorization: Bearer <장비 토큰>.
 */
export async function GET(request: NextRequest) {
  const authed = await authenticateAgentWithRev(request.headers.get("authorization"));
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { agent, rev } = authed;

  const now = new Date();
  const sp = request.nextUrl.searchParams;
  await recordAgentHeartbeat(agent, { applied: sp.get("applied"), error: sp.get("err") }, now);

  const catalogHash = sp.get("ch");
  const common = {
    ok: true,
    rev,
    pollSeconds: AGENT_POLL_SECONDS,
    staleSeconds: AGENT_STALE_SECONDS,
    // 서버가 가진 서비스 목록이 장비 것과 다르면 올려 달라고 한다
    needCatalog: !!catalogHash && catalogHash !== agent.catalogHash,
  };

  const until = sp.get("until");
  if (sp.get("rev") === rev && until && new Date(until) > now) {
    return NextResponse.json({ ...common, unchanged: true, refreshAt: until });
  }

  const [inputs, row] = await Promise.all([
    loadPolicyInputs(now),
    prisma.accessAgent.findUnique({ where: { id: agent.id }, select: { catalog: true } }),
  ]);
  const desired = buildDesired({ ...inputs, catalog: row?.catalog, host: request.headers.get("host"), now });
  const head = {
    ...common,
    version: desired.config.version,
    fallbackVersion: desired.fallback?.version ?? null,
    refreshAt: desired.refreshAt,
  };

  if (sp.get("v") === desired.config.version && (sp.get("fv") ?? "") === (desired.fallback?.version ?? "")) {
    return NextResponse.json({ ...head, unchanged: true });
  }
  return NextResponse.json({
    ...head,
    unchanged: false,
    managed: { begin: MANAGED_BEGIN, end: MANAGED_END, clientPrefix: MANAGED_CLIENT_PREFIX, clientTag: MANAGED_CLIENT_TAG },
    rules: desired.config.rules,
    clients: desired.config.clients,
    fallback: desired.fallback ? { rules: desired.fallback.rules, clients: desired.fallback.clients } : null,
    unknownServices: desired.config.unknownServices,
  });
}
