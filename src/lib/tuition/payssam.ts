// 결제선생(페이민트) 파트너 API v2 클라이언트 — 청구서 발송·재발송·조회·파기·결제 취소, 쌤포인트 조회.
// 스펙: https://developers.payssam.kr (2026-10 기준, v2.0.1). API 키는 서버에서만 읽는다.
//
// 결제선생의 "청구서" 한 장이 우리 결제 행 하나다 (billId = 결제 링크 키 = 주문 키, 청구서당 결제 한 건).
//  · 청구서를 만들면(sendType URL) 결제 주소(shortUrl)를 받는다. TALK 이면 결제선생이 학부모에게 카카오 알림톡을 보낸다.
//  · 결제되면 결제선생이 우리 콜백(/api/webhooks/payssam)을 부른다. 본문은 믿지 않고 billId 로 다시 조회한다.
//  · 조회는 billId 단건만 된다 (목록 API 없음) — 대조는 우리가 아는 billId 를 하나씩 조회한다.
//  · 결제 취소는 청구서 전액만 된다. 부분 환불은 직접 돌려준 뒤 기록한다 (provider.partialCancel = false).
//  · 매니저 사이트에서 직접 취소·파기하면 콜백이 오지 않는다 — 대조(조회)로 맞춘다.
//
// 계정(파트너 계약·개발 키)이 생기기 전에 문서만 보고 쓴 코드다. 개발 키를 받으면 확인할 것
// (scripts/check-payssam.ts 가 순서대로 돌려 본다):
//  · hash 표기 — SHA-256 을 16진 소문자 문자열로 보낸다고 가정했다 (문서에는 "SHA-256으로 생성"까지만 있다)
//  · sendType=URL 일 때 phone 에 전화번호가 아닌 고객 식별자를 넣어도 되는지 (가이드는 된다고 하고, 오류표에는 번호 형식 오류가 있다)
//  · TALK 응답에도 shortUrl 이 오는지, URL 로 만든 청구서를 재발송(/bill/resend)할 수 있는지
//  · 조회 응답에서 미결제(W)·취소(C) 때 apprPrice·apprDt·apprOriginDt 가 어떻게 오는지
//  · 오류 응답의 HTTP 상태 (200 + code 인지 4xx 인지) — 어느 쪽이든 code 로 판단하게 해 두었다
//  · productName·message 의 최대 길이, expireDt 가 발송일 이후 날짜를 받는지
//  · 개발 환경의 billId 규칙(사업자등록번호 10자리 + 10자리)이 v2 에도 적용되는지 → PAYSSAM_BILL_PREFIX

import { createHash } from "node:crypto";

import {
  ProviderError,
  type CancelOrderInput,
  type CreateLinkInput,
  type DeleteLinkContext,
  type ProviderCardInfo,
  type ProviderLink,
  type ProviderOrder,
  type TuitionProvider,
} from "@/lib/tuition/provider";

export const PAYSSAM_SANDBOX_URL = "https://sandbox.paymint.co.kr/partner";
/** 결제 완료 콜백을 받는 우리 경로 */
export const PAYSSAM_CALLBACK_PATH = "/api/webhooks/payssam";

const TIMEOUT_MS = 8_000;
const BILL_ID_MAX = 20;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 정상 응답 코드 */
const OK = "0000";
/** 이미 쓴 billId (v2 · v1) */
const DUPLICATE_BILL = new Set(["BILL_001", "9800"]);
/** 청구서 없음 (v2 · v1) */
const BILL_NOT_FOUND = new Set(["BILL_003", "9980"]);
/** 이미 취소된 청구서 (v2 · v1) */
const ALREADY_CANCELED = new Set(["BILL_002", "9970"]);
/** 반영 여부를 알 수 없는 오류 — 점검 중, 미분류 서버 오류 */
const UNKNOWN_OUTCOME = new Set(["ERROR", "MAINTAINED_METHOD", "9999", "5000"]);

type Json = Record<string, unknown>;
type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type PayssamConfig = {
  apiKey: string;
  /** 파트너 사용자 코드 */
  member: string;
  /** 파트너 매장 코드 (하위사업장) */
  merchant: string;
  /** API 주소 (끝에 / 없이) */
  baseUrl: string;
  /** 콜백을 받을 우리 서버 주소 (끝에 / 없이) */
  appUrl: string;
  /** 콜백 주소에 붙이는 토큰 (?k=) — 콜백을 보낸 쪽을 가리는 값 */
  callbackToken: string | null;
  /** 청구서 발급처명. 없으면 결제선생에 등록된 사업장명이 나온다 */
  billIssuer: string | null;
  /** billId 앞에 붙이는 값 (영문·숫자 10자 이내) — 개발 환경은 사업자등록번호 10자리를 요구한다 */
  billPrefix: string;
  /** 카카오 알림톡(TALK) 발송을 쓸지 — 파트너 계약에 TALK 가 들어 있어야 한다 */
  talk: boolean;
};

export type PayssamDeps = {
  fetch?: FetchLike;
  /** 모의 결제선생에 붙은 경우 true */
  mock?: boolean;
};

function asRecord(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

function asString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** "690000" → 690000. 숫자가 아니면 0 */
function toInt(value: unknown): number {
  const text = asString(value);
  return text && /^\d{1,10}$/.test(text) ? Number(text) : 0;
}

/** "yyyyMMddHHmmss"(KST) → Date */
export function parsePayssamDateTime(value: unknown): Date | null {
  const text = asString(value);
  const m = text ? /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(text) : null;
  if (!m) return null;
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - KST_OFFSET_MS;
  return Number.isNaN(utc) ? null : new Date(utc);
}

/** KST 달력 날짜 "YYYY-MM-DD" */
function kstDateKey(at: Date): string {
  return new Date(at.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 통신 암호 키 — 값들을 쉼표로 이어 SHA-256 (16진 소문자) */
export function payssamHash(parts: string[]): string {
  return createHash("sha256").update(parts.join(","), "utf8").digest("hex");
}

/** 휴대폰번호면 숫자만 남겨 돌려준다. 아니면 null */
function normalizeMobile(phone: string | null | undefined): string | null {
  const digits = typeof phone === "string" ? phone.replace(/[^0-9]/g, "") : "";
  return /^01[016789]\d{7,8}$/.test(digits) ? digits : null;
}

/**
 * billId — 접두어 + 종류(u = 주소만, t = 알림톡) + 결제 행 id 의 해시. 20자 이내, 영문 소문자·숫자.
 * 같은 결제 행은 항상 같은 billId 가 된다 → 응답을 못 받고 다시 보내도 청구서가 두 장 생기지 않는다.
 */
export function payssamBillId(prefix: string, paymentId: string, notify: boolean): string {
  const room = BILL_ID_MAX - prefix.length - 1;
  const digest = BigInt(`0x${createHash("sha256").update(paymentId, "utf8").digest("hex")}`).toString(36);
  return `${prefix}${notify ? "t" : "u"}${digest.slice(0, room)}`;
}

const PAY_TYPE_LABEL: Record<string, string> = {
  CARD_VAN: "카드",
  KEYIN: "카드",
  OFFLINE_CARD: "카드",
  OFFLINE_CASH: "현금",
  "0": "간편결제",
};

function mapCard(data: Json): ProviderCardInfo | null {
  const issuer = asString(data.apprIssuer);
  const approvalNumber = asString(data.apprOriginNum) ?? asString(data.apprNum);
  if (!issuer && !approvalNumber) return null;
  const cardType = asString(data.apprCardType);
  const monthly = asString(data.apprMonthly);
  return {
    issuer,
    cardType: cardType && cardType !== "정보없음" ? cardType : null,
    installmentMonths: monthly && /^\d{1,2}$/.test(monthly) ? Number(monthly) : null,
    approvalNumber,
  };
}

/** 취소 거래 식별자 — 청구서는 전액 한 번만 취소되므로 billId 로 고정한다 (다시 조회해도 같은 값) */
function cancelKey(billId: string): string {
  return `payssam-cancel:${billId}`;
}

/**
 * 청구서 조회 응답 → ProviderOrder. 카드번호(apprIssuerNum) 등은 옮기지 않는다.
 * apprState: W 미결제 · F 결제완료 · C 취소 · D 파기
 */
export function mapPayssamBill(billId: string, raw: unknown): ProviderOrder {
  const data = asRecord(raw) ?? {};
  const state = asString(data.apprState);
  const amount = toInt(data.apprPrice);
  const base = {
    orderKey: billId,
    productKey: billId,
    metaPaymentId: null,
    amount,
    paymentKey: null,
    receiptUrl: null,
    virtualAccount: null,
  };

  if (state === "F") {
    const payType = asString(data.apprPayType);
    return {
      ...base,
      status: "DONE",
      method: (payType && PAY_TYPE_LABEL[payType]) ?? (asString(data.apprIssuer) ? "카드" : null),
      approvedAt: parsePayssamDateTime(data.apprOriginDt) ?? parsePayssamDateTime(data.apprDt),
      card: mapCard(data),
      cancels: [],
    };
  }
  if (state === "C") {
    // 취소는 결제된 뒤에만 된다 (W → F → C). 취소 상태에서는 apprDt 가 취소 일시, apprOriginDt 가 원거래 일시다
    const canceledAt = parsePayssamDateTime(data.apprDt);
    const payType = asString(data.apprPayType);
    return {
      ...base,
      status: "CANCELED",
      method: (payType && PAY_TYPE_LABEL[payType]) ?? (asString(data.apprIssuer) ? "카드" : null),
      approvedAt: parsePayssamDateTime(data.apprOriginDt) ?? canceledAt ?? new Date(),
      card: mapCard(data),
      cancels: [{ transactionKey: cancelKey(billId), amount, reason: null, canceledAt }],
    };
  }
  return {
    ...base,
    status: state === "D" ? "FAILED" : "NONE",
    method: null,
    approvedAt: null,
    card: null,
    cancels: [],
    ...(state === "D" ? { linkClosed: true } : {}),
  };
}

/** 환경변수 → 설정. 필수 값이 없거나 형식이 틀리면 null (온라인 결제 미사용으로 본다) */
export function loadPayssamConfig(env: NodeJS.ProcessEnv, appUrl: string): PayssamConfig | null {
  const apiKey = env.PAYSSAM_API_KEY?.trim() ?? "";
  const member = env.PAYSSAM_MEMBER?.trim() ?? "";
  const merchant = env.PAYSSAM_MERCHANT?.trim() ?? "";
  if (!apiKey || !member || !merchant) return null;

  const explicitBase = env.PAYSSAM_BASE_URL?.trim().replace(/\/+$/, "") ?? "";
  if (!explicitBase && env.NODE_ENV === "production") {
    // 운영 주소는 연동 검수 뒤에 따로 받는다 — 모르는 채로 개발 주소에 운영 청구서를 보내지 않는다
    console.error("[tuition:payssam] 운영에서는 PAYSSAM_BASE_URL 을 반드시 설정해야 합니다");
    return null;
  }
  const baseUrl = explicitBase || PAYSSAM_SANDBOX_URL;
  const billPrefix = env.PAYSSAM_BILL_PREFIX?.trim() ?? "";
  if (!/^https?:\/\/[^\s]+$/.test(baseUrl) || !/^[A-Za-z0-9]{0,10}$/.test(billPrefix)) {
    console.error("[tuition:payssam] PAYSSAM_BASE_URL 또는 PAYSSAM_BILL_PREFIX 형식이 올바르지 않습니다");
    return null;
  }
  return {
    apiKey,
    member,
    merchant,
    baseUrl,
    appUrl: appUrl.replace(/\/+$/, ""),
    callbackToken: env.PAYSSAM_CALLBACK_TOKEN?.trim() || null,
    billIssuer: env.PAYSSAM_BILL_ISSUER?.trim().slice(0, 50) || null,
    billPrefix,
    talk: env.PAYSSAM_TALK === "1",
  };
}

export type PayssamClient = ReturnType<typeof createPayssamClient>;

/** 결제선생 API 호출 묶음 — 어댑터와 연결 확인 스크립트가 같이 쓴다 */
export function createPayssamClient(config: PayssamConfig, deps: PayssamDeps = {}) {
  const doFetch: FetchLike = deps.fetch ?? ((url, init) => fetch(url, init));
  const auth = { apiKey: config.apiKey, member: config.member, merchant: config.merchant };

  /**
   * retry=true 는 조회처럼 다시 보내도 안전한 요청에만.
   * 결과는 HTTP 상태가 아니라 본문의 code 로 판단한다 (0000 = 성공). 읽을 수 없는 응답·5xx 는 "알 수 없음".
   */
  async function call(path: string, body: Json, options: { retry?: boolean } = {}): Promise<Json> {
    const attempts = options.retry ? 2 : 1;
    let lastError: ProviderError | null = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await doFetch(`${config.baseUrl}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=UTF-8", Accept: "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const payload = asRecord(await response.json().catch(() => null));
        const code = asString(payload?.code);
        const message = asString(payload?.message) ?? asString(payload?.msg);
        if (code === OK) return asRecord(payload?.data) ?? payload ?? {};

        if (!code || response.status === 429 || response.status >= 500 || UNKNOWN_OUTCOME.has(code)) {
          lastError = new ProviderError(message ?? `결제선생 응답 오류 (${response.status})`, "unavailable", code);
        } else {
          throw new ProviderError(message ?? "결제선생이 요청을 거절했습니다", "rejected", code);
        }
      } catch (error) {
        if (error instanceof ProviderError && error.kind === "rejected") throw error;
        lastError =
          error instanceof ProviderError ? error : new ProviderError("결제선생에 연결하지 못했습니다", "unavailable");
      }
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 400));
    }
    throw lastError ?? new ProviderError("결제선생에 연결하지 못했습니다", "unavailable");
  }

  return {
    /** 청구서 생성. TALK 이면 결제선생이 알림톡을 보낸다 (쌤포인트 차감) */
    async sendBill(bill: {
      billId: string;
      sendType: "TALK" | "URL";
      productName: string;
      price: number;
      memberName: string;
      phone: string;
      message?: string;
      /** 유효기간 YYYY-MM-DD (그날 자정까지) */
      expireDt?: string;
      callbackUrl: string;
      /** 결제 완료 뒤 돌아갈 주소 — URL 방식에서만 동작한다 */
      pageRedirectUrl?: string;
    }): Promise<{ shortUrl: string | null }> {
      const price = String(bill.price);
      const data = await call("/bill", {
        ...auth,
        bill: {
          billId: bill.billId,
          sendType: bill.sendType,
          ...(config.billIssuer ? { billIssuer: config.billIssuer } : {}),
          productName: bill.productName,
          price,
          memberName: bill.memberName,
          phone: bill.phone,
          ...(bill.message ? { message: bill.message } : {}),
          ...(bill.expireDt ? { expireDt: bill.expireDt } : {}),
          hash: payssamHash([bill.billId, bill.phone, price]),
          callbackUrl: bill.callbackUrl,
          ...(bill.pageRedirectUrl ? { pageRedirectUrl: bill.pageRedirectUrl } : {}),
        },
      });
      return { shortUrl: asString(data.shortUrl) };
    },

    /** 알림톡 재발송 (쌤포인트 차감) */
    async resendBill(billId: string): Promise<void> {
      await call("/bill/resend", { ...auth, bill: { billId } });
    },

    /** 청구서 단건 조회. 없는 청구서면 null */
    async readBill(billId: string): Promise<Json | null> {
      try {
        return await call("/bill/read", { ...auth, bill: { billId } }, { retry: true });
      } catch (error) {
        if (error instanceof ProviderError && error.kind === "rejected" && BILL_NOT_FOUND.has(error.code ?? "")) {
          return null;
        }
        throw error;
      }
    },

    /** 미결제 청구서 파기 */
    async destroyBill(billId: string, price: number): Promise<void> {
      const amount = String(price);
      await call("/bill/destroy", { ...auth, bill: { billId, price: amount, hash: payssamHash([billId, amount]) } });
    },

    /** 결제 취소 (청구서 전액). 취소 일시를 돌려준다 */
    async cancelBill(billId: string, price: number, reason: string): Promise<{ canceledAt: Date | null }> {
      const amount = String(price);
      const data = await call("/bill/cancel", {
        ...auth,
        bill: {
          billId,
          price: amount,
          // 취소 사유는 20자까지
          cancelReason: reason.slice(0, 20),
          hash: payssamHash([billId, amount]),
        },
      });
      return { canceledAt: parsePayssamDateTime(data.apprCancelDt) };
    },

    /** 쌤포인트 잔액 — 하위사업장 기준. 충전 주소도 함께 온다 */
    async remainCount(): Promise<{ balance: number | null; chargeUrl: string | null }> {
      const data = await call("/read/merchant/remain_count", { ...auth }, { retry: true });
      const balance = data.balance;
      const chargeUrl = asString(data.chargeUrl);
      return {
        balance: typeof balance === "number" && Number.isFinite(balance) ? balance : null,
        chargeUrl: chargeUrl && /^https:\/\//i.test(chargeUrl) ? chargeUrl : null,
      };
    },
  };
}

export function createPayssamProvider(config: PayssamConfig, deps: PayssamDeps = {}): TuitionProvider {
  const client = createPayssamClient(config, deps);
  const kindIndex = config.billPrefix.length;

  /** 콜백 주소 — 개발에서는 접속한 서버 주소(baseUrl)로, 운영에서는 설정된 앱 주소로만 만든다 */
  function callbackUrl(devBaseUrl: string | undefined): string {
    const base =
      process.env.NODE_ENV !== "production" && devBaseUrl ? devBaseUrl.replace(/\/+$/, "") : config.appUrl;
    const query = config.callbackToken ? `?k=${encodeURIComponent(config.callbackToken)}` : "";
    return `${base}${PAYSSAM_CALLBACK_PATH}${query}`;
  }

  return {
    name: "payssam",
    partialCancel: false,
    linkIsOrder: true,
    canNotify: config.talk,
    testMode: deps.mock === true || config.baseUrl === PAYSSAM_SANDBOX_URL,

    getBalance() {
      return client.remainCount();
    },

    linkKeyFor(paymentId, options) {
      return payssamBillId(config.billPrefix, paymentId, options?.notify === true);
    },

    isNotifyLink(productKey) {
      return productKey.charAt(kindIndex) === "t";
    },

    async createLink(input: CreateLinkInput): Promise<ProviderLink> {
      const notify = input.notify === true;
      if (notify && !config.talk) {
        throw new ProviderError("카카오 알림톡 청구서 발송을 쓰지 않는 설정입니다", "rejected", "TALK_DISABLED");
      }
      const billId = payssamBillId(config.billPrefix, input.paymentId, notify);
      const mobile = normalizeMobile(input.customer?.phone);
      if (notify && !mobile) {
        throw new ProviderError("학부모 휴대폰 번호가 없거나 형식이 올바르지 않습니다", "rejected", "INVALID_PHONE");
      }
      // 주소만 받는 방식은 번호 대신 고객 식별자를 넣을 수 있다 (가이드 권장 — 번호가 겹쳐도 자동결제가 섞이지 않는다)
      const phone = mobile ?? (input.customer?.key ?? input.paymentId).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 30);

      let shortUrl: string | null;
      try {
        ({ shortUrl } = await client.sendBill({
          billId,
          sendType: notify ? "TALK" : "URL",
          productName: (input.title ?? input.name).slice(0, 50),
          price: input.amount,
          memberName: (input.customer?.name ?? input.name).slice(0, 30),
          phone,
          ...(input.message?.trim() ? { message: input.message.trim().slice(0, 200) } : {}),
          expireDt: kstDateKey(input.validThrough),
          callbackUrl: callbackUrl(input.baseUrl),
          ...(input.returnUrl && !notify ? { pageRedirectUrl: input.returnUrl } : {}),
        }));
      } catch (error) {
        if (error instanceof ProviderError && error.kind === "rejected" && DUPLICATE_BILL.has(error.code ?? "")) {
          // 같은 결제 행으로 이미 만든 청구서 — 앞선 요청이 응답 없이 반영된 것이다.
          // 알림톡은 이미 나갔으니 그대로 두고 성공으로 본다 (결제 주소는 알림톡에 있다).
          if (notify) return { productKey: billId, url: null };
          // 주소만 받는 방식은 주소를 다시 받을 길이 없다 — 아무도 열 수 없는 청구서가 남지 않게 파기하고,
          // 호출 측이 새 결제 행(새 billId)으로 다시 만든다.
          await client.destroyBill(billId, input.amount).catch(() => undefined);
        }
        throw error;
      }
      if (!shortUrl && !notify) throw new ProviderError("결제 주소를 받지 못했습니다", "unavailable");
      return { productKey: billId, url: shortUrl };
    },

    async deleteLink(productKey: string, context: DeleteLinkContext): Promise<void> {
      try {
        await client.destroyBill(productKey, context.amount);
      } catch (error) {
        // 만들어진 적 없거나 이미 닫힌 청구서 — 할 일이 없다
        const code = error instanceof ProviderError && error.kind === "rejected" ? (error.code ?? "") : null;
        if (code !== null && (BILL_NOT_FOUND.has(code) || ALREADY_CANCELED.has(code))) return;
        throw error;
      }
    },

    async resendLink(productKey: string): Promise<void> {
      try {
        await client.resendBill(productKey);
      } catch (error) {
        if (error instanceof ProviderError && error.kind === "rejected" && BILL_NOT_FOUND.has(error.code ?? "")) {
          // 호출 측이 "청구서가 없으니 새로 만들어 보내야 한다"로 알아보는 공통 코드
          throw new ProviderError(error.message, "rejected", "LINK_NOT_FOUND");
        }
        throw error;
      }
    },

    async getOrder(orderKey: string): Promise<ProviderOrder | null> {
      const data = await client.readBill(orderKey);
      return data ? mapPayssamBill(orderKey, data) : null;
    },

    // 목록 API 가 없다 — 대조는 linkIsOrder 로 우리가 아는 billId 를 하나씩 조회한다
    async listRecentOrders(): Promise<ProviderOrder[]> {
      return [];
    },

    async cancelOrder(input: CancelOrderInput): Promise<ProviderOrder> {
      const billId = input.orderKey;
      const before = await client.readBill(billId);
      if (!before) throw new ProviderError("취소할 청구서를 찾지 못했습니다", "rejected", "BILL_003");
      const current = mapPayssamBill(billId, before);
      // 이미 취소된 청구서 — 앞선 요청이 반영된 것이므로 같은 결과를 돌려준다 (멱등)
      if (current.status === "CANCELED") return current;
      if (current.status !== "DONE") {
        throw new ProviderError("결제가 완료되지 않은 청구서는 취소할 수 없습니다", "rejected", "NOT_PAID");
      }
      if (current.amount <= 0) {
        // 결제 금액을 읽지 못하면 얼마를 취소하는지 확정할 수 없다 — 보내지 않고 사람에게 넘긴다
        throw new ProviderError("결제 금액을 확인하지 못했습니다", "unavailable");
      }
      if (input.amount !== undefined && input.amount !== current.amount) {
        throw new ProviderError(
          "결제선생은 결제 금액 전체만 취소할 수 있습니다. 일부 금액은 직접 환불한 뒤 기록해 주세요",
          "rejected",
          "PARTIAL_CANCEL_UNSUPPORTED",
        );
      }

      let canceledAt: Date | null = null;
      try {
        ({ canceledAt } = await client.cancelBill(billId, current.amount, input.reason));
      } catch (error) {
        const already =
          error instanceof ProviderError && error.kind === "rejected" && ALREADY_CANCELED.has(error.code ?? "");
        if (!already) throw error;
      }
      return {
        ...current,
        status: "CANCELED",
        approvedAt: current.approvedAt ?? new Date(),
        cancels: [
          { transactionKey: cancelKey(billId), amount: current.amount, reason: input.reason, canceledAt: canceledAt ?? new Date() },
        ],
      };
    },
  };
}
