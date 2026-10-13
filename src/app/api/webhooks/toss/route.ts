import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";

import { safeEqual } from "@/lib/cron-auth";
import { handleProviderWebhook } from "@/lib/tuition/core";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * 토스페이먼츠 웹훅 — POST /api/webhooks/toss?k=<TOSS_WEBHOOK_TOKEN>
 *
 * 보낸 쪽은 웹훅 주소에 넣어 둔 토큰(k)으로 가린다.
 * 본문은 "어느 주문이 바뀌었다"는 신호로만 쓴다: eventType 과 data.orderKey 만 읽고, 금액·상태는
 * 코어가 orderKey 로 결제사에 다시 조회한 값만 반영한다. 본문에는 구매자 이름·연락처가 들어 있으므로
 * 그 밖의 값은 읽지도 로그에 남기지도 않는다.
 *
 * 토스는 200 이 아니면 다시 보낸다 — 처리할 대상이 아닌 요청은 200 으로 끝내고,
 * 실제 반영에 실패했을 때만 500 을 돌려 재전송을 받는다.
 */

const ORDER_EVENT = "ORDER_PAYMENT_STATUS_CHANGED";
const ORDER_KEY = /^[A-Za-z0-9_-]{1,200}$/;
/** 정상 웹훅은 수 KB — 그보다 크면 읽지 않는다 */
const MAX_BODY_CHARS = 64 * 1024;

/** 수납 화면에 보일 변화가 있었던 결과 */
const VISIBLE_OUTCOMES = new Set(["PAID", "DUPLICATE", "WAITING_DEPOSIT", "CANCELS_APPLIED"]);

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const ignored = () => json({ ok: true, ignored: true });

async function readOrderKey(request: NextRequest): Promise<string | null> {
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_CHARS) return null;
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (!body || typeof body !== "object") return null;

  const { eventType, data } = body as { eventType?: unknown; data?: unknown };
  if (eventType !== ORDER_EVENT || !data || typeof data !== "object") return null;

  const { orderKey } = data as { orderKey?: unknown };
  return typeof orderKey === "string" && ORDER_KEY.test(orderKey) ? orderKey : null;
}

export async function POST(request: NextRequest) {
  const token = process.env.TOSS_WEBHOOK_TOKEN?.trim() ?? "";
  if (token) {
    if (!safeEqual(request.nextUrl.searchParams.get("k") ?? "", token)) {
      return json({ error: "Unauthorized" }, 401);
    }
  } else if (process.env.NODE_ENV === "production") {
    // 토큰 없이는 아무나 결제사 재조회를 일으킬 수 있다 — 운영에서는 받지 않는다 (로컬 모의 결제만 예외)
    return json({ error: "TOSS_WEBHOOK_TOKEN이 설정되지 않았습니다" }, 503);
  }

  const orderKey = await readOrderKey(request);
  if (!orderKey) return ignored();

  try {
    const { outcome } = await handleProviderWebhook(orderKey);
    if (VISIBLE_OUTCOMES.has(outcome)) revalidatePath("/tuition");
    return json({ ok: true, outcome });
  } catch (error) {
    console.error("[tuition:webhook]", error instanceof Error ? error.message : String(error));
    return json({ error: "웹훅을 처리하지 못했습니다" }, 500);
  }
}
