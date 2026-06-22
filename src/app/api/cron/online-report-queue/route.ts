import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import {
  listQueuedPrompts,
  applyGeneratedReport,
} from "@/lib/online/report-queue";

// 예약 생성 큐 — 야간 Claude 루틴 연동 엔드포인트.
//   GET  ?limit=30  → 봉인된 프롬프트 N건 반환 (오래 대기한 것부터)
//   POST { results: [{ reportId, markdown }] } → 생성결과 반영 → DRAFT 전환
// 인증: Authorization: Bearer ${CRON_SECRET}
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;

  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : 30;
  const items = await listQueuedPrompts(Number.isFinite(limit) ? limit : 30);

  return NextResponse.json({ ok: true, count: items.length, items });
}

type ApplyResult = { reportId: string; markdown?: string };

export async function POST(request: NextRequest) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 파싱 실패" }, { status: 400 });
  }

  // 단건 { reportId, markdown } 또는 배치 { results: [...] } 모두 허용
  const b = body as { results?: ApplyResult[] } & ApplyResult;
  const results: ApplyResult[] = Array.isArray(b.results)
    ? b.results
    : b.reportId
      ? [{ reportId: b.reportId, markdown: b.markdown }]
      : [];

  if (results.length === 0) {
    return NextResponse.json(
      { error: "reportId/markdown 또는 results 배열이 필요합니다" },
      { status: 400 },
    );
  }

  let applied = 0;
  let failed = 0;
  const detail: Array<{ reportId: string; ok: boolean; reason?: string }> = [];
  for (const r of results) {
    if (!r?.reportId || typeof r.markdown !== "string") {
      failed++;
      detail.push({ reportId: r?.reportId ?? "?", ok: false, reason: "필드 누락" });
      continue;
    }
    const res = await applyGeneratedReport({
      reportId: r.reportId,
      markdown: r.markdown,
    });
    if (res.ok) applied++;
    else failed++;
    detail.push({ reportId: r.reportId, ok: res.ok, reason: res.reason });
  }

  return NextResponse.json({ ok: failed === 0, applied, failed, detail });
}
