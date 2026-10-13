import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";

import { safeEqual } from "@/lib/cron-auth";
import { handleProviderWebhook } from "@/lib/tuition/core";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * 결제선생 결제 승인 동기화 콜백 — POST /api/webhooks/payssam?k=<PAYSSAM_CALLBACK_TOKEN>
 * (청구서를 만들 때 callbackUrl 로 넘긴 주소. 결제가 승인되면 결제선생이 부른다.)
 *
 * 보낸 쪽은 두 가지로 가린다: 콜백 주소에 넣어 둔 토큰(k), 그리고 본문의 apiKey 가 우리 키와 같은지.
 * 본문은 "어느 청구서가 결제됐다"는 신호로만 쓴다 — billId 만 읽고, 금액·상태는 코어가 billId 로
 * 결제선생에 다시 조회한 값만 반영한다. 본문에는 카드번호 일부 등이 들어 있으므로 그 밖의 값은 읽지도 로그에 남기지도 않는다.
 *
 * 응답은 결제선생이 정한 형식을 그대로 지킨다: 성공은 {"code":"0000","msg":"성공하였습니다."}.
 * 이 응답을 받지 못하면 결제선생이 승인 일시 기준 24시간 동안 매시간 다시 보낸다 —
 * 처리할 대상이 아닌 요청은 0000 으로 끝내고, 실제 반영에 실패했을 때만 실패로 답해 재전송을 받는다.
 */

const BILL_ID = /^[A-Za-z0-9_-]{1,20}$/;
/** 정상 콜백은 수 KB — 그보다 크면 읽지 않는다 */
const MAX_BODY_CHARS = 64 * 1024;

/** 수납 화면에 보일 변화가 있었던 결과 */
const VISIBLE_OUTCOMES = new Set(["PAID", "DUPLICATE", "CANCELS_APPLIED"]);

const reply = (code: string, msg: string, status = 200) =>
  Response.json({ code, msg }, { status, headers: { "Cache-Control": "no-store" } });

const success = () => reply("0000", "성공하였습니다.");

async function readBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_CHARS) return null;
    const body: unknown = JSON.parse(text);
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const token = process.env.PAYSSAM_CALLBACK_TOKEN?.trim() ?? "";
  if (token) {
    if (!safeEqual(request.nextUrl.searchParams.get("k") ?? "", token)) return reply("1003", "접근이 불가한 사용자 입니다.", 401);
  } else if (process.env.NODE_ENV === "production") {
    // 토큰 없이는 아무나 결제선생 재조회를 일으킬 수 있다 — 운영에서는 받지 않는다 (로컬 모의 결제만 예외)
    return reply("5000", "PAYSSAM_CALLBACK_TOKEN이 설정되지 않았습니다", 503);
  }

  const body = await readBody(request);
  if (!body) return reply("9999", "처리 중에 오류가 발생했습니다.", 400);

  // 본문의 apiKey 가 우리 키와 다르면 다른 파트너의 콜백이거나 위조다 (v2: apiKey · v1: apikey)
  const apiKey = process.env.PAYSSAM_API_KEY?.trim() ?? "";
  const sentKey = typeof body.apiKey === "string" ? body.apiKey : typeof body.apikey === "string" ? body.apikey : "";
  if (apiKey && !safeEqual(sentKey, apiKey)) return reply("1003", "접근이 불가한 사용자 입니다.", 401);

  const rawBillId = body.billId ?? body.bill_id;
  // 우리가 만든 청구서가 아니면 다시 받아도 달라질 게 없다 — 정상 수신으로 끝낸다
  if (typeof rawBillId !== "string" || !BILL_ID.test(rawBillId)) return success();

  try {
    const { outcome } = await handleProviderWebhook(rawBillId);
    if (VISIBLE_OUTCOMES.has(outcome)) revalidatePath("/tuition");
    return success();
  } catch (error) {
    console.error("[tuition:payssam-callback]", error instanceof Error ? error.message : String(error));
    return reply("9999", "처리 중에 오류가 발생했습니다.", 500);
  }
}
