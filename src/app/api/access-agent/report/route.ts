import { NextRequest, NextResponse } from "next/server";

import { authenticateAgent, recordAgentReport, type AgentReport } from "@/lib/access-control/store";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_000_000;

/**
 * 시설 장비의 상태 보고 — 적용한 설정 버전·오류, 와이파이에서 발견한 기기, AdGuard Home 서비스 목록.
 * 인증: Authorization: Bearer <장비 토큰>.
 */
export async function POST(request: NextRequest) {
  const agent = await authenticateAgent(request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  let report: AgentReport;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    report = parsed as AgentReport;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { needCatalog } = await recordAgentReport(agent, report, new Date());
  return NextResponse.json({ ok: true, needCatalog });
}
