import type { NextRequest } from "next/server";

import { won } from "@/lib/tuition/format";
import {
  handlePayssamMock,
  PAYSSAM_MOCK_PATH,
  payssamMockApproval,
  payssamMockGet,
  payssamMockManagerCancel,
  payssamMockManagerDestroy,
  payssamMockPay,
  payssamMockPoints,
  payssamMockSetFault,
  payssamMockSetPoints,
  type PayssamMockBill,
} from "@/lib/tuition/payssam-mock";
import { isPayssamMockEnabled } from "@/lib/tuition/provider-registry";

export const dynamic = "force-dynamic";

/**
 * 개발 전용 모의 결제선생 — 파트너 계약·개발 키 없이 결제선생 흐름 전체를 로컬에서 돌려 본다.
 * PAYSSAM_BASE_URL=mock (운영 제외)일 때만 응답하고 그 밖에는 404.
 *
 *  · GET  /pay/<billId>  — 모바일청구서 자리에 서는 결제 페이지 (shortUrl 이 여기를 가리킨다)
 *  · POST /pay/<billId>  — 결제·매니저 사이트 직접 취소·파기, 다음 요청 장애 설정. 결제하면 결제선생이 하듯
 *                          청구서의 callbackUrl 로 승인 동기화 콜백을 HTTP 로 보낸다
 *  · POST /bill 등       — 문서의 API 경로 그대로 (연결 확인 스크립트를 모의 서버에 돌려 볼 때)
 */

const CALLBACK_TIMEOUT_MS = 20_000;
const STATE_LABEL = { W: "미결제", F: "결제완료", C: "취소", D: "파기" } as const;

type Notice = { tone: "ok" | "err"; message: string };

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** 청구 사유·고객명 등 바깥에서 온 값은 전부 이걸 거쳐서 넣는다 */
function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

const notFound = () => new Response("Not Found", { status: 404 });

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}

function payPath(billId: string, notice?: Notice): string {
  const path = `${PAYSSAM_MOCK_PATH}/pay/${encodeURIComponent(billId)}`;
  if (!notice) return path;
  return `${path}?${new URLSearchParams({ tone: notice.tone, msg: notice.message.slice(0, 400) }).toString()}`;
}

function layout(content: string): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<title>모의 결제선생 청구서 (개발 전용)</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f2f4f6; color: #191f28; font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; }
  main { max-width: 480px; margin: 0 auto; padding: 20px 16px 48px; }
  h1 { margin: 8px 0 4px; font-size: 22px; }
  h2 { margin: 0 0 12px; font-size: 16px; }
  p { margin: 0; }
  .tag { display: inline-block; padding: 2px 8px; border-radius: 6px; background: #ffe8cc; color: #b35c00; font-size: 12px; font-weight: 700; }
  .lead { color: #6b7684; font-size: 13px; }
  section { margin-top: 16px; padding: 16px; border-radius: 14px; background: #fff; }
  dl { display: grid; grid-template-columns: 84px 1fr; gap: 6px 12px; margin: 0; }
  dt { color: #6b7684; }
  dd { margin: 0; word-break: break-all; }
  .notice { margin-top: 16px; padding: 12px 14px; border-radius: 12px; font-size: 14px; word-break: break-all; }
  .notice.ok { background: #e7f4ee; color: #0b6b43; }
  .notice.err { background: #fdecec; color: #b42318; }
  form { margin: 0; }
  form + form { margin-top: 12px; }
  button { width: 100%; padding: 13px 14px; border: 0; border-radius: 10px; background: #3182f6; color: #fff; font: inherit; font-weight: 700; }
  button.sub { background: #e5e8eb; color: #333d4b; }
  button.warn { background: #f04452; }
  button:disabled { opacity: 0.4; }
  label.check { display: flex; align-items: center; gap: 6px; margin-top: 6px; color: #4e5968; font-size: 13px; }
  .hint { margin-top: 6px; color: #8b95a1; font-size: 12px; }
</style>
</head>
<body>
<main>
<span class="tag">개발 전용</span>
<h1>모의 결제선생 청구서</h1>
<p class="lead">실제 결제가 아닙니다. 결제선생 모바일청구서를 대신하는 로컬 검증용 화면이며, 여기서 한 조작은 dev 서버 메모리에만 남습니다.</p>
${content}
</main>
</body>
</html>`;
}

function action(billId: string, name: string, inner: string): string {
  return `<form method="post" action="${esc(payPath(billId))}"><input type="hidden" name="action" value="${esc(name)}">${inner}</form>`;
}

function renderBill(bill: PayssamMockBill, notice: Notice | null): string {
  const open = bill.state === "W";
  const paid = bill.state === "F";
  return layout(`${notice ? `<p class="notice ${notice.tone}">${esc(notice.message)}</p>` : ""}
<section>
<h2>${esc(bill.productName)}</h2>
<dl>
<dt>금액</dt><dd><strong>${esc(won(bill.price))}</strong></dd>
<dt>고객명</dt><dd>${esc(bill.memberName)}</dd>
<dt>상태</dt><dd>${esc(STATE_LABEL[bill.state])}</dd>
<dt>발송</dt><dd>${bill.sendType === "TALK" ? `알림톡 ${bill.talkCount}회` : "주소만 (URL)"}</dd>
${bill.message ? `<dt>안내</dt><dd>${esc(bill.message)}</dd>` : ""}
<dt>billId</dt><dd>${esc(bill.billId)}</dd>
</dl>
</section>
<section>
<h2>고객 결제</h2>
${action(bill.billId, "pay", `<button type="submit"${open ? "" : " disabled"}>카드로 결제 (성공)</button><label class="check"><input type="checkbox" name="callback" value="1" checked> 승인 동기화 콜백 보내기</label>`)}
${action(bill.billId, "decline", `<button type="submit" class="sub"${open ? "" : " disabled"}>결제 실패 재현 (카드 거절)</button><p class="hint">결제 실패는 파트너에게 전달되지 않습니다. 아무 기록도 남지 않습니다.</p>`)}
</section>
<section>
<h2>매니저 사이트에서 직접 처리</h2>
<p class="hint">결제선생 매니저 사이트에서 직접 취소·파기하면 콜백이 오지 않습니다. 대조 작업(조회)이 뒤늦게 맞춥니다.</p>
${action(bill.billId, "manager-cancel", `<button type="submit" class="warn"${paid ? "" : " disabled"}>결제 직접 취소</button>`)}
${action(bill.billId, "manager-destroy", `<button type="submit" class="sub"${open ? "" : " disabled"}>청구서 직접 파기</button>`)}
</section>
<section>
<h2>장애 · 포인트</h2>
${action(bill.billId, "fault-timeout", `<button type="submit" class="sub">다음 API 요청: 반영은 되고 응답 없음</button>`)}
${action(bill.billId, "fault-maintenance", `<button type="submit" class="sub">다음 API 요청: 점검 중 응답</button>`)}
${action(bill.billId, "points-zero", `<button type="submit" class="sub">쌤포인트 0 으로 (현재 ${payssamMockPoints()})</button>`)}
${action(bill.billId, "points-fill", `<button type="submit" class="sub">쌤포인트 100 으로</button>`)}
</section>`);
}

/** 결제선생이 하듯 청구서의 callbackUrl 로 승인 동기화 콜백을 보내고, 응답을 화면에 보여 줄 한 줄로 돌려준다 */
async function sendCallback(request: NextRequest, bill: PayssamMockBill): Promise<Notice> {
  let url: URL;
  try {
    // 콜백 주소는 우리 서버여야 한다 — 다른 곳으로는 보내지 않는다 (개발 서버가 임의 주소를 두드리지 않게)
    url = new URL(bill.callbackUrl);
    if (url.origin !== request.nextUrl.origin) return { tone: "err", message: `콜백 주소가 이 서버가 아닙니다 (${url.origin})` };
  } catch {
    return { tone: "err", message: "콜백 주소가 올바르지 않습니다" };
  }
  try {
    const apiKey = process.env.PAYSSAM_API_KEY?.trim() || "mock-api-key";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payssamMockApproval(bill, apiKey)),
      cache: "no-store",
      signal: AbortSignal.timeout(CALLBACK_TIMEOUT_MS),
    });
    const text = (await res.text()).slice(0, 200);
    const accepted = res.ok && /"code"\s*:\s*"0000"/.test(text);
    return { tone: accepted ? "ok" : "err", message: `콜백 응답 ${res.status} ${text}` };
  } catch (error) {
    return { tone: "err", message: `콜백 호출 실패 (${error instanceof Error ? error.message : "알 수 없는 오류"})` };
  }
}

async function routePath(context: { params: Promise<{ path: string[] }> }): Promise<string[]> {
  return (await context.params).path ?? [];
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (!isPayssamMockEnabled()) return notFound();
  const [kind, billId] = await routePath(context);
  if (kind !== "pay" || !billId) return notFound();
  const bill = payssamMockGet(billId);
  if (!bill) {
    return html(
      layout(`<section><h2>청구서를 찾을 수 없습니다</h2><p class="lead">모의 결제선생 상태는 dev 서버 메모리에만 있습니다. 서버를 다시 띄웠다면 앱에서 결제하기를 다시 눌러 주세요.</p></section>`),
      404,
    );
  }
  const tone = request.nextUrl.searchParams.get("tone");
  const message = request.nextUrl.searchParams.get("msg");
  return html(renderBill(bill, message && (tone === "ok" || tone === "err") ? { tone, message } : null));
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (!isPayssamMockEnabled()) return notFound();
  const path = await routePath(context);

  // API 경로 — 문서의 요청·응답 형식 그대로
  if (path[0] !== "pay") {
    const body: unknown = await request.json().catch(() => null);
    const result = handlePayssamMock(`/${path.join("/")}`, body);
    if (result.body === null) return new Response(null, { status: result.status });
    return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
  }

  const billId = path[1] ?? "";
  const bill = payssamMockGet(billId);
  if (!bill) return notFound();
  const form = await request.formData().catch(() => null);
  const field = (name: string) => {
    const value = form?.get(name);
    return typeof value === "string" ? value : "";
  };

  let notice: Notice;
  switch (field("action")) {
    case "pay": {
      const paid = payssamMockPay(billId);
      if (!paid) {
        notice = { tone: "err", message: "결제할 수 없는 상태입니다" };
        break;
      }
      if (field("callback") !== "1") {
        notice = { tone: "ok", message: "결제 완료 · 콜백은 보내지 않았습니다 (누락 재현) — 결제 확인이나 대조 작업으로 반영됩니다" };
        break;
      }
      const sent = await sendCallback(request, paid);
      // URL 방식은 결제가 끝나면 파트너가 준 주소로 돌려보낸다 (우리 서버 주소일 때만)
      if (sent.tone === "ok" && paid.pageRedirectUrl) {
        try {
          const back = new URL(paid.pageRedirectUrl);
          if (back.origin === request.nextUrl.origin) return Response.redirect(back, 303);
        } catch {
          // 돌려보낼 주소가 올바르지 않으면 결과 화면에 머문다
        }
      }
      notice = { tone: sent.tone, message: `결제 완료 · ${sent.message}` };
      break;
    }
    case "decline":
      notice = { tone: "err", message: "카드가 거절되었습니다 (모의). 결제선생은 실패를 알려 주지 않으므로 서버에는 아무 기록도 남지 않습니다" };
      break;
    case "manager-cancel":
      notice = payssamMockManagerCancel(billId)
        ? { tone: "ok", message: "매니저 사이트에서 결제를 취소했습니다 (콜백 없음)" }
        : { tone: "err", message: "결제된 청구서만 취소할 수 있습니다" };
      break;
    case "manager-destroy":
      notice = payssamMockManagerDestroy(billId)
        ? { tone: "ok", message: "매니저 사이트에서 청구서를 파기했습니다 (콜백 없음)" }
        : { tone: "err", message: "미결제 청구서만 파기할 수 있습니다" };
      break;
    case "fault-timeout":
      payssamMockSetFault("timeout");
      notice = { tone: "ok", message: "다음 API 요청 한 번은 반영된 뒤 응답이 오지 않습니다" };
      break;
    case "fault-maintenance":
      payssamMockSetFault("maintenance");
      notice = { tone: "ok", message: "다음 API 요청 한 번은 점검 중으로 응답합니다" };
      break;
    case "points-zero":
      payssamMockSetPoints(0);
      notice = { tone: "ok", message: "쌤포인트를 0 으로 맞췄습니다 — 알림톡 발송이 포인트 부족으로 거절됩니다" };
      break;
    case "points-fill":
      payssamMockSetPoints(100);
      notice = { tone: "ok", message: "쌤포인트를 100 으로 맞췄습니다" };
      break;
    default:
      notice = { tone: "err", message: "알 수 없는 동작입니다" };
  }
  return Response.redirect(new URL(payPath(billId, notice), request.nextUrl.origin), 303);
}
