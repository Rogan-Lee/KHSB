// 개발 전용 모의 결제선생 서버 — 파트너 계약·개발 키 없이 결제선생 연동 흐름을 로컬에서 돌려 본다.
// 문서(https://developers.payssam.kr, v2)의 요청·응답 형식과 오류 코드를 그대로 흉내 낸다:
// 청구서 발송(URL·TALK)·재발송·조회·파기·결제 취소·쌤포인트 조회, hash 검증, billId 중복 거절.
//
// 실제 결제선생과 같다는 보장은 없다 — "문서를 우리가 읽은 대로" 만든 것이다. 우리 쪽 연동 로직
// (콜백 처리, 전액 취소, 파기, 매니저 사이트 직접 취소 감지)을 확인하는 용도로만 쓴다.
// 상태는 프로세스 메모리에만 있다. 운영에서는 라우트가 404 로 막는다.

import { createHash } from "node:crypto";

export type PayssamMockBill = {
  billId: string;
  sendType: "TALK" | "URL";
  productName: string;
  memberName: string;
  phone: string;
  price: number;
  message: string | null;
  callbackUrl: string;
  pageRedirectUrl: string | null;
  /** W 미결제 · F 결제완료 · C 취소 · D 파기 */
  state: "W" | "F" | "C" | "D";
  /** 알림톡을 보낸 횟수 (TALK 발송 + 재발송) */
  talkCount: number;
  approvedAt: Date | null;
  approvalNumber: string | null;
  canceledAt: Date | null;
  cancelNumber: string | null;
};

/** 다음 요청 한 번에만 적용할 장애 — 반영은 되고 응답만 못 받는 상황(timeout), 점검 중 응답(maintenance) */
export type PayssamMockFault = "none" | "timeout" | "maintenance";

type MockState = {
  bills: Map<string, PayssamMockBill>;
  points: number;
  fault: PayssamMockFault;
  /** 장애를 걸 경로 ("/bill/cancel" 등). null 이면 다음 요청 아무 것에나 */
  faultPath: string | null;
  seq: number;
};

const globalForMock = globalThis as unknown as { __payssamMock?: MockState };

function state(): MockState {
  globalForMock.__payssamMock ??= { bills: new Map(), points: 100, fault: "none", faultPath: null, seq: 0 };
  return globalForMock.__payssamMock;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** Date → "yyyyMMddHHmmss" (KST) */
function compact(at: Date): string {
  return new Date(at.getTime() + KST_OFFSET_MS).toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

function sha256(parts: string[]): string {
  return createHash("sha256").update(parts.join(","), "utf8").digest("hex");
}

function nextNumber(): string {
  const s = state();
  s.seq += 1;
  return String(30_000_000 + s.seq);
}

type Reply = { status: number; body: unknown };

const ok = (data: unknown): Reply => ({ status: 200, body: { code: "0000", message: "성공하였습니다.", data } });
const fail = (code: string, message: string, status = 200): Reply => ({ status, body: { code, message } });

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** 조회 응답·콜백 본문 — 문서의 승인 정보 필드 구성 */
export function payssamMockApproval(bill: PayssamMockBill, apiKey: string): Record<string, unknown> {
  const paid = bill.state === "F" || bill.state === "C";
  const canceled = bill.state === "C";
  return {
    apiKey,
    billId: bill.billId,
    apprState: bill.state,
    apprPayType: paid ? "CARD_VAN" : null,
    apprCardType: paid ? "신용" : null,
    apprDt: canceled && bill.canceledAt ? compact(bill.canceledAt) : paid && bill.approvedAt ? compact(bill.approvedAt) : null,
    apprOriginDt: paid && bill.approvedAt ? compact(bill.approvedAt) : null,
    apprPrice: paid ? String(bill.price) : null,
    apprIssuer: paid ? "현대카드" : null,
    apprIssuerCd: paid ? "04" : null,
    apprIssuerNum: paid ? "4321-****-****-1234" : null,
    apprNum: canceled ? bill.cancelNumber : paid ? bill.approvalNumber : null,
    apprOriginNum: paid ? bill.approvalNumber : null,
    apprMonthly: paid ? "0" : null,
  };
}

/** 모의 결제선생 API — path 는 API 주소 뒤의 경로("/bill", "/bill/read" …) */
export function handlePayssamMock(path: string, rawBody: unknown): Reply {
  const s = state();
  const body = rawBody && typeof rawBody === "object" ? (rawBody as Record<string, unknown>) : {};
  const apiKey = text(body.apiKey);
  if (!apiKey) return fail("PARTNER_002", "apiKey 정보를 확인할 수 없습니다.", 400);
  if (path !== "/read/remain_count" && (!text(body.member) || !text(body.merchant))) {
    return fail("PARTNER_004", "찾을 수 없는 하위사업장 연동 정보입니다.", 400);
  }

  // 장애는 한 번만 — 경로를 정해 두었으면 그 경로의 요청이 올 때까지 남겨 둔다
  const armed = s.fault !== "none" && (s.faultPath === null || s.faultPath === path);
  const fault = armed ? s.fault : "none";
  if (armed) {
    s.fault = "none";
    s.faultPath = null;
  }
  if (fault === "maintenance") return fail("MAINTAINED_METHOD", "점검 중입니다.");
  // timeout 은 아래에서 요청을 정상 반영한 뒤 응답만 떨어뜨린다
  const finish = (reply: Reply): Reply => (fault === "timeout" ? { status: 504, body: null } : reply);

  if (path === "/read/remain_count" || path === "/read/merchant/remain_count") {
    return finish(ok({ balance: s.points, chargeUrl: "https://manager.payssam.kr/" }));
  }

  const billInput = body.bill && typeof body.bill === "object" ? (body.bill as Record<string, unknown>) : null;
  const billId = text(billInput?.billId);
  if (!billInput || !billId) {
    return fail("VALIDATION_001", "정상적이지 않은 데이터입니다. 연동규격서를 확인하시기 바랍니다.", 400);
  }
  if (billId.length > 20) return fail("BILL_007", "billId는 20자 이하여야 합니다.", 400);
  const existing = s.bills.get(billId) ?? null;

  switch (path) {
    case "/bill": {
      const sendType = text(billInput.sendType);
      if (sendType !== "TALK" && sendType !== "URL") return fail("BILL_008", "sendType은 필수값입니다. (TALK 또는 URL)", 400);
      const price = text(billInput.price);
      const phone = text(billInput.phone);
      const required = ["productName", "memberName", "callbackUrl", "hash"].every((key) => text(billInput[key]));
      if (!required || !phone || !/^\d{1,10}$/.test(price)) {
        return fail("VALIDATION_001", "정상적이지 않은 데이터입니다. 연동규격서를 확인하시기 바랍니다.", 400);
      }
      if (text(billInput.hash) !== sha256([billId, phone, price])) {
        return fail("VALIDATION_002", "정상적이지 않은 데이터입니다. 해싱값을 확인하시기 바랍니다.", 400);
      }
      if (sendType === "TALK" && !/^01[016789]\d{7,8}$/.test(phone)) {
        return fail("VALIDATION_004", "휴대폰 번호 형식이 올바르지 않습니다.", 400);
      }
      if (Number(price) < 100) return fail("PAYMENT_003", "100원 이상 청구할 수 있습니다");
      if (Number(price) < 20_000) return fail("PAYMENT_005", "개발 환경에서는 20000원 이상의 금액만 청구할 수 있습니다.");
      if (existing) return fail("BILL_001", "이미 사용된 billId 입니다.");
      if (sendType === "TALK") {
        if (s.points <= 0) return fail("POINT_001", "포인트가 부족합니다");
        s.points -= 1;
      }
      s.bills.set(billId, {
        billId,
        sendType,
        productName: text(billInput.productName),
        memberName: text(billInput.memberName),
        phone,
        price: Number(price),
        message: text(billInput.message) || null,
        callbackUrl: text(billInput.callbackUrl),
        pageRedirectUrl: sendType === "URL" ? text(billInput.pageRedirectUrl) || null : null,
        state: "W",
        talkCount: sendType === "TALK" ? 1 : 0,
        approvedAt: null,
        approvalNumber: null,
        canceledAt: null,
        cancelNumber: null,
      });
      return finish(
        ok({
          apiKey,
          member: body.member,
          merchant: body.merchant,
          billId,
          hash: billInput.hash,
          shortUrl: `${mockOrigin(text(billInput.callbackUrl))}${PAYSSAM_MOCK_PATH}/pay/${encodeURIComponent(billId)}`,
        }),
      );
    }
    case "/bill/resend": {
      if (!existing) return fail("BILL_003", "청구서를 찾을 수 없습니다.");
      if (existing.state !== "W") return fail("BILL_006", "청구서 발송이 가능한 상태가 아닙니다.");
      if (s.points <= 0) return fail("POINT_001", "포인트가 부족합니다");
      s.points -= 1;
      existing.talkCount += 1;
      return finish(ok({ apiKey, billId }));
    }
    case "/bill/read": {
      if (!existing) return fail("BILL_003", "청구서를 찾을 수 없습니다.");
      return finish(ok(payssamMockApproval(existing, apiKey)));
    }
    case "/bill/destroy":
    case "/bill/cancel": {
      if (!existing) return fail("BILL_003", "청구서를 찾을 수 없습니다.");
      const price = text(billInput.price);
      if (text(billInput.hash) !== sha256([billId, price])) {
        return fail("VALIDATION_002", "정상적이지 않은 데이터입니다. 해싱값을 확인하시기 바랍니다.", 400);
      }
      if (Number(price) !== existing.price) {
        return fail("VALIDATION_001", "정상적이지 않은 데이터입니다. 연동규격서를 확인하시기 바랍니다.", 400);
      }
      if (path === "/bill/destroy") {
        if (existing.state === "F") return fail("ERROR", "기 결제된 청구서 입니다.");
        if (existing.state !== "W") return fail("BILL_002", "기 취소된 청구서 입니다.");
        existing.state = "D";
        return finish(ok({ apiKey, billId }));
      }
      if (existing.state === "C") return fail("BILL_002", "기 취소된 청구서 입니다.");
      if (existing.state !== "F") return fail("PAYMENT_002", "결제 취소에 실패하였습니다.");
      existing.state = "C";
      existing.canceledAt = new Date();
      existing.cancelNumber = nextNumber();
      return finish(
        ok({
          apiKey,
          member: body.member,
          merchant: body.merchant,
          billId,
          hash: billInput.hash,
          apprNum: existing.cancelNumber,
          apprOriginNum: existing.approvalNumber,
          apprCancelDt: compact(existing.canceledAt),
        }),
      );
    }
    default:
      return { status: 404, body: { code: "ERROR", message: "처리 중 오류가 발생하였습니다." } };
  }
}

// ─── 모의 서버 주소 ─────────────────────────────────────────────────────

/** 모의 결제선생의 결제 페이지가 떠 있는 우리 라우트 */
export const PAYSSAM_MOCK_PATH = "/api/webhooks/payssam-mock";

/** 결제 페이지 주소(shortUrl)의 서버 주소 — 모의 서버는 콜백을 받는 우리 서버와 같은 곳에 떠 있다 */
function mockOrigin(callbackUrl: string): string {
  try {
    return new URL(callbackUrl).origin;
  } catch {
    return "http://localhost:3000";
  }
}

// ─── 모의 결제 페이지·테스트가 쓰는 조작 함수 ───────────────────────────

export function payssamMockGet(billId: string): PayssamMockBill | null {
  return state().bills.get(billId) ?? null;
}

/** 고객이 청구서에서 결제 — 미결제 청구서만. 결제된 청구서를 돌려준다 (콜백은 호출 측이 보낸다) */
export function payssamMockPay(billId: string): PayssamMockBill | null {
  const bill = state().bills.get(billId);
  if (!bill || bill.state !== "W") return null;
  bill.state = "F";
  bill.approvedAt = new Date();
  bill.approvalNumber = nextNumber();
  return bill;
}

/** 매니저 사이트에서 직접 결제 취소 — 콜백이 가지 않는다 */
export function payssamMockManagerCancel(billId: string): boolean {
  const bill = state().bills.get(billId);
  if (!bill || bill.state !== "F") return false;
  bill.state = "C";
  bill.canceledAt = new Date();
  bill.cancelNumber = nextNumber();
  return true;
}

/** 매니저 사이트에서 직접 청구서 파기 — 콜백이 가지 않는다 */
export function payssamMockManagerDestroy(billId: string): boolean {
  const bill = state().bills.get(billId);
  if (!bill || bill.state !== "W") return false;
  bill.state = "D";
  return true;
}

/** 다음 요청 한 번에 장애를 건다. path 를 주면 그 경로("/bill/cancel" 등)의 다음 요청에만 건다 */
export function payssamMockSetFault(fault: PayssamMockFault, path: string | null = null): void {
  const s = state();
  s.fault = fault;
  s.faultPath = fault === "none" ? null : path;
}

export function payssamMockSetPoints(points: number): void {
  state().points = points;
}

export function payssamMockPoints(): number {
  return state().points;
}

export function payssamMockReset(): void {
  globalForMock.__payssamMock = undefined;
}

/** 모의 서버로 바로 이어지는 fetch — HTTP 없이 클라이언트·어댑터를 돌려 볼 때 (테스트·스모크 스크립트) */
export function createPayssamMockFetch(baseUrl: string): (url: string, init: RequestInit) => Promise<Response> {
  return async (url, init) => {
    const path = url.startsWith(baseUrl) ? url.slice(baseUrl.length) : url;
    let body: unknown = null;
    try {
      body = JSON.parse(typeof init.body === "string" ? init.body : "null");
    } catch {
      body = null;
    }
    const reply = handlePayssamMock(path, body);
    if (reply.body === null) throw new Error("모의 결제선생: 응답 없음");
    return Response.json(reply.body, { status: reply.status });
  };
}
