import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";

import { handleClassupEvent, verifyClassupSignature } from "@/lib/classup";

export const dynamic = "force-dynamic";

/**
 * 클래스업 변경 알림(출입) — POST /api/webhooks/classup
 *
 * `scripts/classup.ts webhook:create` 로 등록하고 응답의 signingSecret 을 CLASSUP_WEBHOOK_SECRET 에 넣는다
 * (비밀 교체 중 5분은 "새비밀,이전비밀" 처럼 쉼표로 둘 다).
 * 클래스업은 5초 안에 2xx 가 아니면 1분부터 간격을 늘려 다시 보내고, 24시간 계속 실패하면 구독을 끊는다 —
 * 반영 실패만 500, 처리할 대상이 아닌 본문은 200.
 */

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  const secrets = (process.env.CLASSUP_WEBHOOK_SECRET ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!secrets.length) return json({ error: "CLASSUP_WEBHOOK_SECRET이 설정되지 않았습니다" }, 503);

  // 서명은 받은 원문 그대로 검증한다 (JSON 재직렬화 금지)
  const raw = await request.text();
  const verified = verifyClassupSignature(
    raw,
    request.headers.get("x-classup-timestamp") ?? "",
    request.headers.get("x-classup-signature") ?? "",
    secrets,
  );
  if (!verified) return json({ error: "Unauthorized" }, 401);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ ok: true, ignored: true });
  }

  try {
    const { applied } = await handleClassupEvent(body);
    if (applied) revalidatePath("/attendance");
    return json({ ok: true, applied });
  } catch (error) {
    console.error("[classup:webhook]", error instanceof Error ? error.message : String(error));
    return json({ error: "출결을 반영하지 못했습니다" }, 500);
  }
}
