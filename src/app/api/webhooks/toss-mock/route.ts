import type { NextRequest } from "next/server";

import { won } from "@/lib/tuition/format";
import {
  mockDeposit,
  mockGetCancelBehavior,
  mockGetLink,
  mockPay,
  mockSetCancelBehavior,
  type MockCancelBehavior,
  type MockLink,
} from "@/lib/tuition/mock-provider";
import {
  ProviderError,
  providerCanceledAmount,
  type ProviderOrder,
  type ProviderOrderStatus,
} from "@/lib/tuition/provider";
import { isMockProviderEnabled } from "@/lib/tuition/provider-registry";

export const dynamic = "force-dynamic";

/**
 * 개발 전용 모의 결제 페이지 — 토스 결제창 자리에 서서 수강료 흐름 전체를 로컬에서 돌려 본다.
 * 모의 결제사(TUITION_PROVIDER=mock, 운영 제외)가 켜져 있을 때만 응답하고 그 밖에는 404.
 *
 *  · GET ?product=<key> — 결제 링크와 그 링크에서 생긴 주문, 조작 버튼
 *  · POST (form) — 결제·입금·환불 동작 설정. 결제사가 하듯 우리 웹훅(/api/webhooks/toss)을 HTTP 로 부른다
 *
 * 카드 거절은 실제로도 결제창 안에서 끝나고 우리 서버에 오지 않으므로, "결제 실패 재현"은 아무것도 남기지 않는다.
 */

const PAGE_PATH = "/api/webhooks/toss-mock";
const WEBHOOK_TIMEOUT_MS = 20_000;

const ORDER_STATUS_LABEL: Record<ProviderOrderStatus, string> = {
  NONE: "결제 정보 없음",
  WAITING_FOR_DEPOSIT: "입금 대기",
  DONE: "결제 완료",
  PARTIAL_CANCELED: "부분 취소",
  CANCELED: "취소",
  FAILED: "실패",
};

const CANCEL_BEHAVIORS: { value: MockCancelBehavior; label: string }[] = [
  { value: "ok", label: "정상" },
  { value: "reject", label: "거절" },
  { value: "timeout", label: "타임아웃 (반영은 되고 응답만 못 받음)" },
];

type Notice = { tone: "ok" | "err"; message: string };

// ─── HTML ─────────────────────────────────────────────────────────────

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** 링크 이름·쿼리 값 등 바깥에서 온 값은 전부 이걸 거쳐서 넣는다 */
function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

const dateTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  dateStyle: "medium",
  timeStyle: "short",
});

function pagePath(productKey: string, notice?: Notice): string {
  const params = new URLSearchParams({ product: productKey });
  if (notice) {
    params.set("tone", notice.tone);
    params.set("msg", notice.message.slice(0, 400));
  }
  return `${PAGE_PATH}?${params.toString()}`;
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

const notFound = () => new Response("Not Found", { status: 404 });

function layout(content: string): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>모의 결제 (개발 전용)</title>
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
  select { width: 100%; margin-bottom: 8px; padding: 11px 10px; border: 1px solid #d1d6db; border-radius: 10px; background: #fff; font: inherit; }
  .hint { margin-top: 6px; color: #8b95a1; font-size: 12px; }
  ul.orders { margin: 0; padding: 0; list-style: none; }
  ul.orders li { padding: 12px 0; border-top: 1px solid #f2f4f6; }
  ul.orders li:first-child { padding-top: 0; border-top: 0; }
  .key { color: #8b95a1; font-size: 12px; word-break: break-all; }
  .empty { color: #8b95a1; }
</style>
</head>
<body>
<main>
<span class="tag">개발 전용</span>
<h1>모의 결제 (개발 전용)</h1>
<p class="lead">실제 결제가 아닙니다. 결제사 결제창을 대신하는 로컬 검증용 화면이며, 여기서 한 조작은 dev 서버 메모리에만 남습니다.</p>
${content}
</main>
</body>
</html>`;
}

function webhookCheckbox(): string {
  return `<label class="check"><input type="checkbox" name="webhook" value="1" checked> 웹훅 보내기</label>`;
}

function actionForm(
  productKey: string,
  action: string,
  inner: string,
  extraFields: Record<string, string> = {},
): string {
  const hidden = Object.entries({ product: productKey, action, ...extraFields })
    .map(([name, value]) => `<input type="hidden" name="${esc(name)}" value="${esc(value)}">`)
    .join("");
  return `<form method="post" action="${esc(pagePath(productKey))}">${hidden}${inner}</form>`;
}

function linkState(link: MockLink, orders: ProviderOrder[]): { label: string; payable: boolean } {
  if (link.deleted) return { label: "판매 종료 (링크 폐기됨)", payable: false };
  if (link.validThrough.getTime() < Date.now()) return { label: "결제 기한 지남", payable: false };
  // 재고 1 — 결제됐거나 입금 대기 중인 주문이 있으면 일반 결제는 막힌다 (중복 결제 재현 버튼만 통한다)
  if (orders.some((order) => order.status === "DONE" || order.status === "WAITING_FOR_DEPOSIT")) {
    return { label: "결제됨 (재고 소진)", payable: true };
  }
  return { label: "결제 가능", payable: true };
}

function orderItem(productKey: string, order: ProviderOrder): string {
  const canceled = providerCanceledAmount(order);
  const lines = [
    `<strong>${esc(ORDER_STATUS_LABEL[order.status])}</strong> · ${esc(order.method ?? "결제수단 없음")} · ${esc(won(order.amount))}`,
    order.approvedAt ? `승인 ${esc(dateTime.format(order.approvedAt))}` : "",
    canceled > 0 ? `취소 ${esc(won(canceled))} (${order.cancels.length}건)` : "",
    order.virtualAccount
      ? `입금 계좌 ${esc(order.virtualAccount.bank ?? "")} ${esc(order.virtualAccount.accountNumber ?? "")}`
      : "",
  ].filter(Boolean);

  const deposit =
    order.status === "WAITING_FOR_DEPOSIT"
      ? actionForm(
          productKey,
          "deposit",
          `<button type="submit" class="sub">입금 처리</button>${webhookCheckbox()}`,
          { orderKey: order.orderKey },
        )
      : "";

  return `<li><p>${lines.join("<br>")}</p><p class="key">${esc(order.orderKey)}</p>${deposit}</li>`;
}

function renderPage(link: MockLink, orders: ProviderOrder[], notice: Notice | null): string {
  const key = link.productKey;
  const state = linkState(link, orders);
  const off = state.payable ? "" : " disabled";
  const currentCancel = mockGetCancelBehavior();

  const noticeHtml = notice
    ? `<p class="notice ${notice.tone === "err" ? "err" : "ok"}">${esc(notice.message)}</p>`
    : "";

  const orderList =
    orders.length > 0
      ? `<ul class="orders">${orders.map((order) => orderItem(key, order)).join("")}</ul>`
      : `<p class="empty">아직 주문이 없습니다.</p>`;

  const cancelOptions = CANCEL_BEHAVIORS.map(
    (b) =>
      `<option value="${esc(b.value)}"${b.value === currentCancel ? " selected" : ""}>${esc(b.label)}</option>`,
  ).join("");

  return layout(`${noticeHtml}
<section>
<h2>결제 링크</h2>
<dl>
<dt>상품명</dt><dd>${esc(link.name)}</dd>
<dt>결제 금액</dt><dd><strong>${esc(won(link.amount))}</strong></dd>
<dt>유효 기한</dt><dd>${esc(dateTime.format(link.validThrough))}</dd>
<dt>상태</dt><dd>${esc(state.label)}</dd>
</dl>
</section>
<section>
<h2>결제하기</h2>
${actionForm(key, "pay-card", `<button type="submit"${off}>카드로 결제 (성공)</button>${webhookCheckbox()}`)}
${actionForm(key, "pay-va", `<button type="submit" class="sub"${off}>가상계좌 선택 (입금 대기)</button>${webhookCheckbox()}`)}
${actionForm(
  key,
  "decline",
  `<button type="submit" class="sub">결제 실패 재현 (카드 거절)</button><p class="hint">거절은 결제창 안에서 끝나고 서버에 알려지지 않습니다. 아무 기록도 남지 않습니다.</p>`,
)}
${actionForm(
  key,
  "pay-dup",
  `<button type="submit" class="warn"${off}>재고 무시하고 한 번 더 결제 (중복 결제 재현)</button>${webhookCheckbox()}`,
)}
</section>
<section>
<h2>이 링크의 주문</h2>
${orderList}
</section>
<section>
<h2>다음 환불 동작 설정</h2>
${actionForm(
  key,
  "cancel-behavior",
  `<select name="behavior" aria-label="다음 환불 동작">${cancelOptions}</select><button type="submit" class="sub">설정</button><p class="hint">다음 환불(결제 취소) 요청 한 번에만 적용되고, 그 뒤에는 정상으로 돌아갑니다.</p>`,
)}
</section>`);
}

function renderMissing(): string {
  return layout(`<section>
<h2>결제 링크를 찾을 수 없습니다</h2>
<p class="lead">모의 결제 상태는 dev 서버 메모리에만 있습니다. 서버를 다시 띄웠다면 앱에서 결제하기를 다시 눌러 새 링크를 받으세요.</p>
</section>`);
}

// ─── 동작 ─────────────────────────────────────────────────────────────

/** 결제사가 하듯 우리 웹훅을 HTTP 로 부르고, 응답 상태와 본문을 화면에 보여 줄 한 줄로 돌려준다 */
async function sendWebhook(request: NextRequest, orderKey: string): Promise<Notice> {
  const token = process.env.TOSS_WEBHOOK_TOKEN?.trim();
  const url = new URL(
    `/api/webhooks/toss${token ? `?k=${encodeURIComponent(token)}` : ""}`,
    request.nextUrl.origin,
  );
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType: "ORDER_PAYMENT_STATUS_CHANGED", data: { orderKey } }),
      cache: "no-store",
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    const body = (await res.text()).slice(0, 200);
    return { tone: res.ok ? "ok" : "err", message: `웹훅 응답 ${res.status} ${body}` };
  } catch (error) {
    return {
      tone: "err",
      message: `웹훅 호출 실패 (${error instanceof Error ? error.message : "알 수 없는 오류"})`,
    };
  }
}

const NO_WEBHOOK = "웹훅은 보내지 않았습니다 (누락 재현) — 앱의 결제 확인이나 15분 대조 작업으로 반영됩니다";

/** 조작 1건 수행. 모의 결제사가 거절하면 ProviderError 를 던진다 */
async function perform(
  request: NextRequest,
  productKey: string,
  field: (name: string) => string,
): Promise<Notice> {
  // 주문은 이미 만들어졌다 — 웹훅이 실패해도 주문 결과와 함께 보여 준다
  const afterOrder = async (label: string, order: ProviderOrder): Promise<Notice> => {
    if (field("webhook") !== "1") return { tone: "ok", message: `${label} · ${NO_WEBHOOK}` };
    const sent = await sendWebhook(request, order.orderKey);
    return { tone: sent.tone, message: `${label} · ${sent.message}` };
  };

  switch (field("action")) {
    case "pay-card":
      return afterOrder("카드 결제 완료", mockPay(productKey, "card"));
    case "pay-va":
      return afterOrder("가상계좌 발급 (입금 대기)", mockPay(productKey, "virtual-account"));
    case "pay-dup":
      return afterOrder("중복 결제 완료 (재고 무시)", mockPay(productKey, "card", { ignoreStock: true }));
    case "deposit": {
      const orderKey = field("orderKey");
      // 다른 링크의 주문을 이 화면에서 건드리지 않게 한다
      const owned = mockGetLink(productKey)?.orders.some((order) => order.orderKey === orderKey);
      if (!owned) return { tone: "err", message: "주문을 찾을 수 없습니다" };
      return afterOrder("입금 처리 완료", mockDeposit(orderKey));
    }
    case "decline":
      return {
        tone: "err",
        message:
          "카드가 거절되었습니다 (모의). 결제사는 거절을 알려 주지 않으므로 서버에는 아무 기록도 남지 않습니다",
      };
    case "cancel-behavior": {
      const behavior = CANCEL_BEHAVIORS.find((b) => b.value === field("behavior"));
      if (!behavior) return { tone: "err", message: "환불 동작을 골라 주세요" };
      mockSetCancelBehavior(behavior.value);
      return { tone: "ok", message: `다음 환불 동작: ${behavior.label}` };
    }
    default:
      return { tone: "err", message: "알 수 없는 동작입니다" };
  }
}

// ─── 라우트 ───────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (!isMockProviderEnabled()) return notFound();

  const params = request.nextUrl.searchParams;
  const found = mockGetLink(params.get("product") ?? "");
  if (!found) return htmlResponse(renderMissing(), 404);

  const message = params.get("msg");
  const notice: Notice | null = message
    ? { tone: params.get("tone") === "err" ? "err" : "ok", message }
    : null;
  return htmlResponse(renderPage(found.link, found.orders, notice));
}

export async function POST(request: NextRequest) {
  if (!isMockProviderEnabled()) return notFound();

  const form = await request.formData().catch(() => null);
  const field = (name: string) => {
    const value = form?.get(name);
    return typeof value === "string" ? value : "";
  };
  const productKey = field("product") || (request.nextUrl.searchParams.get("product") ?? "");
  if (!mockGetLink(productKey)) return htmlResponse(renderMissing(), 404);

  let notice: Notice;
  try {
    notice = await perform(request, productKey, field);
  } catch (error) {
    if (!(error instanceof ProviderError)) throw error;
    notice = { tone: "err", message: error.message };
  }

  // 새로고침으로 결제가 한 번 더 들어가지 않게 결과는 GET 화면으로 넘겨서 보여 준다.
  // next dev 의 request.nextUrl.origin 은 접속한 주소가 아닐 수 있어(localhost 고정) 상대 경로로 보낸다.
  return new Response(null, {
    status: 303,
    headers: { Location: pagePath(productKey, notice), "Cache-Control": "no-store" },
  });
}
