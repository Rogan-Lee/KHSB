/**
 * 토스페이먼츠 연결 확인 — 시크릿 키가 유효한지, 링크페이를 쓸 수 있는 상점인지,
 * 우리 클라이언트(src/lib/tuition/toss-linkpay.ts)가 실제 응답을 제대로 처리하는지 본다. DB 는 건드리지 않는다.
 *
 * 저장소 루트에서 (키는 환경변수로만 — 저장소에 적지 말 것):
 *   TOSS_SECRET_KEY=test_sk_... npx tsx scripts/check-toss.ts
 *   npx tsx --env-file=.env.development.local scripts/check-toss.ts   # 파일에 넣어 둔 경우
 *
 * 테스트 키(test_*)일 때만 쓰기 요청을 보낸다:
 *   · 에러 재현(TossPayments-Test-Code) — 거절·장애 응답을 우리 코드가 어떻게 분류하는지
 *   · 링크페이가 열려 있으면 결제 링크를 하나 만들고 → 조회하고 → 지운다 (유효기간 형식 등 요청 형식 검증)
 * 라이브 키(live_*)에는 조회 요청만 보낸다.
 */
import { randomUUID } from "node:crypto";

const API = "https://api.tosspayments.com";

type Check = { label: string; ok: boolean | null; detail: string };
const checks: Check[] = [];
const record = (label: string, ok: boolean | null, detail: string) => {
  checks.push({ label, ok, detail });
  const mark = ok === null ? "  -  " : ok ? "  ok " : " FAIL";
  console.log(`${mark} ${label} — ${detail}`);
};

async function raw(secretKey: string, path: string): Promise<{ status: number; code: string | null; message: string | null }> {
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}` },
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await response.json().catch(() => null)) as { code?: unknown; message?: unknown } | null;
  return {
    status: response.status,
    code: typeof body?.code === "string" ? body.code : null,
    message: typeof body?.message === "string" ? body.message : null,
  };
}

async function main() {
  const secretKey = process.env.TOSS_SECRET_KEY?.trim() ?? "";
  if (!secretKey) {
    console.error("TOSS_SECRET_KEY 가 없습니다. 예: TOSS_SECRET_KEY=test_sk_... npx tsx scripts/check-toss.ts");
    process.exitCode = 1;
    return;
  }
  const isTest = secretKey.startsWith("test_");
  const isLive = secretKey.startsWith("live_");
  const kind = /^(test|live)_gsk_/.test(secretKey) ? "결제(주문서형·결제창형) 연동 키" : "API 개별 연동 키";
  console.log(`키: ${isTest ? "테스트" : isLive ? "라이브" : "형식 불명"} · ${kind} (${secretKey.slice(0, 8)}…)\n`);
  if (!isTest && !isLive) record("키 형식", false, "test_ 또는 live_ 로 시작해야 합니다");

  // 1) 키가 유효한지 — 없는 주문을 조회해서 "없음"이 돌아오면 인증은 통과한 것
  const core = await raw(secretKey, `/v1/payments/orders/check-${randomUUID().slice(0, 12)}`);
  if (core.code === "UNAUTHORIZED_KEY") {
    record("시크릿 키 인증", false, `${core.message} (HTTP ${core.status})`);
  } else {
    record("시크릿 키 인증", core.status === 404, `${core.code ?? "?"} (HTTP ${core.status}) — 없는 주문 조회에 "없음"이 돌아오면 정상`);
  }

  // 2) 링크페이를 쓸 수 있는 상점인지
  const products = await raw(secretKey, "/v1/products?limit=1");
  const linkpayOpen = products.status === 200;
  if (linkpayOpen) {
    record("링크페이 사용 가능", true, "상품(결제 링크) 조회 성공");
  } else if (products.code === "FORBIDDEN_REQUEST") {
    record("링크페이 사용 가능", false, `${products.message} — 이 상점은 링크페이 계약이 없습니다. 결제 링크를 만들 수 없어요`);
  } else {
    record("링크페이 사용 가능", false, `${products.code ?? "?"}: ${products.message ?? ""} (HTTP ${products.status})`);
  }

  if (!isTest) {
    console.log("\n라이브 키라서 조회만 확인했습니다 (쓰기 요청은 테스트 키에서만 보냅니다).");
    return summarize();
  }

  const { createTossLinkPayProvider } = await import("@/lib/tuition/toss-linkpay");
  const { ProviderError } = await import("@/lib/tuition/provider");
  const provider = createTossLinkPayProvider(secretKey);
  const classify = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return "성공";
    } catch (error) {
      if (error instanceof ProviderError) return `${error.kind}${error.code ? `:${error.code}` : ""}`;
      throw error;
    }
  };
  const validThrough = new Date(Date.now() + 86_400_000);

  // 3) 에러 재현 — 실제 토스 응답을 우리 클라이언트가 어떻게 분류하는지
  console.log("\n에러 재현 (TossPayments-Test-Code):");
  const previous = process.env.TOSS_TEST_CODE;
  const expectations: [string, string, () => Promise<unknown>][] = [
    ["INVALID_REQUEST", "rejected:INVALID_REQUEST", () => provider.createLink({ paymentId: `check-${randomUUID()}`, name: "연결 확인", amount: 1000, validThrough })],
    ["NOT_CANCELABLE_PAYMENT", "rejected:NOT_CANCELABLE_PAYMENT", () => provider.cancelOrder({ orderKey: "check_order", amount: 1000, reason: "연결 확인", idempotencyKey: `check-${randomUUID()}` })],
    ["FAILED_INTERNAL_SYSTEM_PROCESSING", "unavailable:FAILED_INTERNAL_SYSTEM_PROCESSING", () => provider.cancelOrder({ orderKey: "check_order", amount: 1000, reason: "연결 확인", idempotencyKey: `check-${randomUUID()}` })],
  ];
  for (const [code, expected, fn] of expectations) {
    process.env.TOSS_TEST_CODE = code;
    const got = await classify(fn);
    record(`재현 ${code}`, got === expected, `분류 결과 ${got} (기대 ${expected})`);
  }
  if (previous === undefined) delete process.env.TOSS_TEST_CODE;
  else process.env.TOSS_TEST_CODE = previous;

  // 4) 링크페이가 열려 있으면 실제로 결제 링크를 만들었다가 지운다
  if (!linkpayOpen) {
    record("결제 링크 생성·조회·삭제", null, "링크페이 계약 전이라 건너뜀");
    return summarize();
  }
  console.log("\n결제 링크 생성·삭제:");
  const paymentId = `check-${randomUUID()}`;
  try {
    const link = await provider.createLink({ paymentId, name: "연결 확인 (자동 삭제)", amount: 1000, validThrough });
    record("결제 링크 생성", true, `${link.url}`);
    const again = await provider.createLink({ paymentId, name: "연결 확인 (자동 삭제)", amount: 1000, validThrough });
    record("같은 멱등키로 다시 생성", again.productKey === link.productKey, again.productKey === link.productKey ? "같은 링크가 돌아옴" : "다른 링크가 만들어짐 — 멱등키 동작 확인 필요");
    const orders = await provider.listRecentOrders(5);
    record("주문 목록 조회", true, `${orders.length}건`);
    await provider.deleteLink(link.productKey, { amount: 1000 });
    record("결제 링크 삭제", true, "삭제 요청 성공");
  } catch (error) {
    const detail = error instanceof ProviderError ? `${error.kind}:${error.code} ${error.message}` : String(error);
    record("결제 링크 생성·조회·삭제", false, detail);
  }
  summarize();
}

function summarize() {
  const failed = checks.filter((c) => c.ok === false);
  console.log(`\n확인 ${checks.length}건 · 실패 ${failed.length}건`);
  if (!process.env.TOSS_WEBHOOK_TOKEN) {
    console.log("참고: TOSS_WEBHOOK_TOKEN 이 없습니다 — 운영에서는 웹훅을 받지 않습니다 (개발에서는 토큰 없이도 받음).");
  }
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
