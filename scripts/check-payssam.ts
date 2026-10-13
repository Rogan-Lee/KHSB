/**
 * 결제선생 연결 확인 — 개발(sandbox) 키를 받은 뒤, 문서만 보고 쓴 연동 코드(src/lib/tuition/payssam.ts)가
 * 실제 결제선생과 맞는지 순서대로 돌려 본다. 연동 검수에 낼 BILL-ID 도 여기서 나온다.
 *
 * 저장소 루트에서 (키는 .env.development.local 에 둔다 — 화면에 찍지 않는다):
 *   npx tsx --env-file=.env.development.local scripts/check-payssam.ts            기본 점검 (청구서 생성 → 조회 → 파기)
 *   npx tsx --env-file=.env.development.local scripts/check-payssam.ts read <billId>
 *   npx tsx --env-file=.env.development.local scripts/check-payssam.ts cancel <billId>      결제된 청구서 전액 취소
 *   npx tsx --env-file=.env.development.local scripts/check-payssam.ts talk <휴대폰번호> --send   알림톡 청구서를 실제로 보낸다 (쌤포인트 차감)
 *   npx tsx scripts/check-payssam.ts --mock                                         키 없이 모의 결제선생으로 스크립트만 확인
 *
 * 필요한 환경변수: PAYSSAM_API_KEY · PAYSSAM_MEMBER · PAYSSAM_MERCHANT
 * 선택: PAYSSAM_BASE_URL(기본 개발 서버) · PAYSSAM_BILL_PREFIX(개발 환경이 사업자등록번호 10자리를 요구하면)
 *
 * 개발 환경에서도 결제는 실제로 승인된다 (현대·하나·신한 카드만 된다고 한다). 결제 승인·승인 동기화는
 * 앱이나 청구서 링크에서 직접 결제해 확인하고, 여기서는 read · cancel 로 뒤처리를 본다.
 */
import { createHash, randomUUID } from "node:crypto";

type Check = { label: string; ok: boolean | null; detail: string };
const checks: Check[] = [];

function record(label: string, ok: boolean | null, detail: string): void {
  checks.push({ label, ok, detail });
  console.log(`  ${ok === null ? "—" : ok ? "ok" : "실패"}  ${label}${detail ? ` · ${detail}` : ""}`);
}

function summarize(): void {
  const failed = checks.filter((c) => c.ok === false).length;
  console.log(`\n${failed === 0 ? "문제 없음" : `실패 ${failed}건`} (확인 ${checks.filter((c) => c.ok !== null).length}건)`);
  if (failed > 0) process.exitCode = 1;
}

/** 개발 환경 최소 청구 금액 (20,000원 미만은 거절된다) */
const TEST_PRICE = 20_000;

async function main() {
  const args = process.argv.slice(2);
  const useMock = args.includes("--mock");
  const [command = "basic", ...rest] = args.filter((arg) => !arg.startsWith("--"));

  const { createPayssamClient, loadPayssamConfig, mapPayssamBill, payssamBillId, payssamHash, PAYSSAM_SANDBOX_URL } =
    await import("@/lib/tuition/payssam");
  const { ProviderError } = await import("@/lib/tuition/provider");

  const env = useMock
    ? { ...process.env, PAYSSAM_API_KEY: "mock-api-key", PAYSSAM_MEMBER: "mock-member", PAYSSAM_MERCHANT: "mock-merchant", PAYSSAM_BASE_URL: "http://payssam.mock/partner" }
    : process.env;
  const config = loadPayssamConfig(env as NodeJS.ProcessEnv, "https://example.com");
  if (!config) {
    console.error("PAYSSAM_API_KEY · PAYSSAM_MEMBER · PAYSSAM_MERCHANT 를 설정해 주세요 (--mock 으로 스크립트만 확인할 수 있습니다)");
    process.exitCode = 1;
    return;
  }
  const fetchImpl = useMock
    ? (await import("@/lib/tuition/payssam-mock")).createPayssamMockFetch(config.baseUrl)
    : undefined;
  const client = createPayssamClient(config, fetchImpl ? { fetch: fetchImpl } : {});
  const describeError = (error: unknown) =>
    error instanceof ProviderError ? `${error.kind}:${error.code ?? "-"} ${error.message}` : String(error);

  console.log(`결제선생 연결 확인 — ${useMock ? "모의 결제선생" : config.baseUrl}${config.baseUrl === PAYSSAM_SANDBOX_URL ? " (개발)" : ""}`);
  console.log(`member=${config.member} · merchant=${config.merchant} · billId 접두어=${config.billPrefix || "(없음)"}\n`);

  if (command === "read") {
    const billId = rest[0];
    if (!billId) throw new Error("billId 를 적어 주세요");
    const raw = await client.readBill(billId);
    if (!raw) return record("청구서 조회", false, "청구서를 찾을 수 없음");
    // 카드번호 일부가 들어 있는 필드는 찍지 않는다
    const { apprIssuerNum: _hidden, apiKey: _key, ...shown } = raw as Record<string, unknown>;
    void _hidden;
    void _key;
    console.log(JSON.stringify(shown, null, 1));
    const order = mapPayssamBill(billId, raw);
    record("청구서 조회", true, `상태 ${order.status} · 금액 ${order.amount} · 승인 ${order.approvedAt?.toISOString() ?? "-"}`);
    return summarize();
  }

  if (command === "cancel") {
    const billId = rest[0];
    if (!billId) throw new Error("billId 를 적어 주세요");
    const raw = await client.readBill(billId);
    const order = raw ? mapPayssamBill(billId, raw) : null;
    if (!order || order.status !== "DONE") return record("결제 취소", false, `취소할 수 있는 상태가 아님 (${order?.status ?? "없음"})`);
    try {
      const { canceledAt } = await client.cancelBill(billId, order.amount, "연동 확인 취소");
      record("결제 취소", true, `전액 ${order.amount}원 · 취소 일시 ${canceledAt?.toISOString() ?? "응답에 없음"}`);
      const after = await client.readBill(billId);
      const afterOrder = after ? mapPayssamBill(billId, after) : null;
      record(
        "취소 뒤 조회",
        afterOrder?.status === "CANCELED" && afterOrder.cancels[0]?.amount === order.amount,
        `상태 ${afterOrder?.status ?? "없음"} · 취소 금액 ${afterOrder?.cancels[0]?.amount ?? 0} (0 이면 취소 상태에서 apprPrice 가 오지 않는 것 — 코드 확인 필요)`,
      );
      console.log(`\n연동 검수용 BILL-ID — 승인취소: ${billId}`);
    } catch (error) {
      record("결제 취소", false, describeError(error));
    }
    return summarize();
  }

  if (command === "talk") {
    const phone = (rest[0] ?? "").replace(/[^0-9]/g, "");
    if (!/^01[016789]\d{7,8}$/.test(phone)) throw new Error("알림톡을 받을 휴대폰 번호를 적어 주세요");
    if (!args.includes("--send")) {
      console.log("알림톡 청구서를 실제로 보내고 쌤포인트가 차감됩니다. 보내려면 --send 를 붙여 주세요.");
      return;
    }
    const billId = payssamBillId(config.billPrefix, `check-${randomUUID()}`, true);
    try {
      const { shortUrl } = await client.sendBill({
        billId,
        sendType: "TALK",
        productName: "연결 확인 (결제하지 마세요)",
        price: TEST_PRICE,
        memberName: "연결 확인",
        phone,
        callbackUrl: "https://example.com/payssam-callback",
      });
      record("알림톡 청구서 발송", true, `billId ${billId} · 결제 주소 ${shortUrl ?? "응답에 없음 (TALK 은 주소를 주지 않는 것 — 코드는 이 경우를 처리한다)"}`);
      await client.resendBill(billId);
      record("재발송", true, "알림톡이 한 번 더 감");
      await client.destroyBill(billId, TEST_PRICE);
      record("파기", true, "보낸 청구서를 닫음");
    } catch (error) {
      record("알림톡 청구서", false, describeError(error));
    }
    return summarize();
  }

  // ── 기본 점검 ──
  try {
    const balance = await client.remainCount();
    record("쌤포인트 조회", true, `잔액 ${balance.balance ?? "응답에 없음"} · 충전 주소 ${balance.chargeUrl ? "있음" : "없음"}`);
  } catch (error) {
    record("쌤포인트 조회", false, describeError(error));
  }

  const billId = payssamBillId(config.billPrefix, `check-${randomUUID()}`, false);
  const base = {
    billId,
    sendType: "URL" as const,
    productName: "연결 확인 (자동 파기)",
    price: TEST_PRICE,
    memberName: "연결 확인",
    callbackUrl: "https://example.com/payssam-callback",
    pageRedirectUrl: "https://example.com/payssam-return",
    expireDt: new Date(Date.now() + 9 * 3_600_000 + 3 * 86_400_000).toISOString().slice(0, 10),
  };
  let created = false;
  try {
    // 번호 대신 고객 식별자를 넣어도 되는지부터 본다 (가이드는 된다고 한다)
    const { shortUrl } = await client.sendBill({ ...base, phone: "check-user-001" });
    created = true;
    record("청구서 생성 (URL · 고객 식별자)", !!shortUrl, shortUrl ? `결제 주소 ${shortUrl}` : "결제 주소가 응답에 없음");
  } catch (error) {
    record("청구서 생성 (URL · 고객 식별자)", false, describeError(error));
    const code = error instanceof ProviderError ? error.code : null;
    if (code === "VALIDATION_002") {
      // hash 표기가 다른 것 — 어떤 표기가 통하는지 직접 보내 본다 (코드의 payssamHash 를 그에 맞춰 고친다)
      const price = String(TEST_PRICE);
      const variants: [string, (text: string) => string][] = [
        ["16진 대문자", (text) => createHash("sha256").update(text, "utf8").digest("hex").toUpperCase()],
        ["base64", (text) => createHash("sha256").update(text, "utf8").digest("base64")],
      ];
      for (const [label, hash] of variants) {
        const altId = payssamBillId(config.billPrefix, `check-${randomUUID()}`, false);
        const res = await (fetchImpl ?? ((url: string, init: RequestInit) => fetch(url, init)))(`${config.baseUrl}/bill`, {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=UTF-8" },
          body: JSON.stringify({
            apiKey: config.apiKey,
            member: config.member,
            merchant: config.merchant,
            bill: { ...base, billId: altId, price, phone: "check-user-001", hash: hash(`${altId},check-user-001,${price}`) },
          }),
        }).catch(() => null);
        const body = (await res?.json().catch(() => null)) as { code?: string } | null;
        record(`hash 표기 — ${label}`, null, body?.code === "0000" ? "통과 (이 표기로 고쳐야 함)" : `응답 ${body?.code ?? "없음"}`);
        if (body?.code === "0000") await client.destroyBill(altId, TEST_PRICE).catch(() => undefined);
      }
      console.log(`  참고: 지금 코드는 16진 소문자 — 예) ${payssamHash(["bill", "phone", "1000"]).slice(0, 16)}…`);
    }
    if (code === "VALIDATION_004") {
      console.log("  → URL 방식도 휴대폰 번호 형식을 요구한다. payssam.ts 의 createLink 에서 번호가 없을 때의 처리를 바꿔야 한다.");
    }
  }

  if (created) {
    try {
      const raw = await client.readBill(billId);
      const order = raw ? mapPayssamBill(billId, raw) : null;
      record("청구서 조회 (미결제)", order?.status === "NONE", `상태 ${order?.status ?? "없음"}`);
    } catch (error) {
      record("청구서 조회 (미결제)", false, describeError(error));
    }
    try {
      await client.sendBill({ ...base, phone: "check-user-001" });
      record("같은 billId 로 다시 생성", false, "거절되지 않음 — 중복 방지를 billId 에 기대면 안 된다");
    } catch (error) {
      const code = error instanceof ProviderError ? error.code : null;
      record("같은 billId 로 다시 생성", code === "BILL_001" || code === "9800", `응답 ${describeError(error)}`);
    }
    try {
      await client.destroyBill(billId, TEST_PRICE);
      record("청구서 파기", true, "");
      const raw = await client.readBill(billId);
      const order = raw ? mapPayssamBill(billId, raw) : null;
      record("청구서 조회 (파기)", order?.status === "FAILED" && order.linkClosed === true, `상태 ${order?.status ?? "없음"}`);
    } catch (error) {
      record("청구서 파기", false, describeError(error));
    }
    try {
      await client.destroyBill(billId, TEST_PRICE);
      record("이미 파기한 청구서 다시 파기", null, "오류 없이 끝남");
    } catch (error) {
      const code = error instanceof ProviderError ? (error.code ?? "") : "";
      // 코드는 BILL_002 · BILL_003 을 "이미 닫힘"으로 본다 — 다른 코드가 오면 payssam.ts 의 deleteLink 에 추가한다
      record("이미 파기한 청구서 다시 파기", code === "BILL_002" || code === "BILL_003", `응답 ${describeError(error)}`);
    }
    console.log(`\n연동 검수용 BILL-ID — 청구서 파기·조회: ${billId}`);
  }

  console.log("\n남은 확인 (직접 결제가 필요):");
  console.log("  1. 앱이나 청구서 링크에서 결제 → 우리 서버가 콜백을 받고 납부 완료로 바뀌는지 (콜백 응답 0000)");
  console.log("  2. check-payssam.ts read <billId> 로 결제완료 응답의 필드 확인");
  console.log("  3. 어드민에서 전액 환불 또는 check-payssam.ts cancel <billId> → 취소 뒤 조회에 금액이 오는지");
  console.log("  4. 알림톡: check-payssam.ts talk <내 번호> --send");
  summarize();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
