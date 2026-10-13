// 결제사 구현 선택 — 환경변수는 서버에서만 읽는다.
//  · TUITION_PROVIDER 로 결제사를 정해 두면(payssam · toss) 그 결제사만 쓴다. 키가 없으면 온라인 결제 미사용.
//  · TUITION_PROVIDER=mock 은 운영이 아닐 때만 — 키가 있어도 모의 결제를 쓴다 (로컬 검증용. 운영에서는 무시된다)
//  · 정해 두지 않았으면 키가 있는 결제사를 쓴다 — 결제선생(PAYSSAM_API_KEY · MEMBER · MERCHANT) → 토스(TOSS_SECRET_KEY) 순.
//  · 그 밖에는 null — 온라인 결제 미사용. 앱은 결제 버튼을 숨기고 현장 결제만 받는다.
//
// 개발에서 결제선생 흐름을 계정 없이 돌려 보려면 TUITION_PROVIDER=payssam + PAYSSAM_BASE_URL=mock (모의 결제선생).
//
// 결제사를 바꾸면 이전 결제사로 받은 결제는 새 결제사로 조회·취소할 수 없다 (키가 다르다).
// 운영 중에 바꿀 때는 진행 중인 결제·환불이 없는지 먼저 확인할 것.

import { getAppUrl } from "@/lib/app-url";
import { createMockProvider } from "@/lib/tuition/mock-provider";
import { createPayssamProvider, loadPayssamConfig } from "@/lib/tuition/payssam";
import { createPayssamMockFetch } from "@/lib/tuition/payssam-mock";
import type { TuitionProvider } from "@/lib/tuition/provider";
import { createTossLinkPayProvider } from "@/lib/tuition/toss-linkpay";

let cached: { key: string; provider: TuitionProvider | null } | null = null;

export function isMockProviderEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.TUITION_PROVIDER === "mock";
}

/**
 * 모의 결제선생(개발 전용)을 쓰는지 — PAYSSAM_BASE_URL=mock 이면 결제선생 연동 코드를 그대로 타되
 * 요청이 우리 안의 모의 서버(payssam-mock.ts)로 간다. 운영에서는 켜지지 않는다.
 */
export function isPayssamMockEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.PAYSSAM_BASE_URL?.trim() === "mock";
}

function createPayssam(): TuitionProvider | null {
  const appUrl = getAppUrl();
  if (isPayssamMockEnabled()) {
    // 모의 서버는 같은 프로세스 안에 있다 — HTTP 를 거치지 않고 바로 부른다 (주소는 형식만 맞춘 값)
    const baseUrl = "http://payssam.mock/partner";
    const config = loadPayssamConfig(
      {
        ...process.env,
        PAYSSAM_API_KEY: process.env.PAYSSAM_API_KEY || "mock-api-key",
        PAYSSAM_MEMBER: process.env.PAYSSAM_MEMBER || "mock-member",
        PAYSSAM_MERCHANT: process.env.PAYSSAM_MERCHANT || "mock-merchant",
        PAYSSAM_BASE_URL: baseUrl,
      },
      appUrl,
    );
    return config ? createPayssamProvider(config, { fetch: createPayssamMockFetch(baseUrl), mock: true }) : null;
  }
  const config = loadPayssamConfig(process.env, appUrl);
  return config ? createPayssamProvider(config) : null;
}

export function getTuitionProvider(): TuitionProvider | null {
  const choice = process.env.TUITION_PROVIDER?.trim() ?? "";
  const secretKey = process.env.TOSS_SECRET_KEY?.trim() ?? "";
  const cacheKey = [
    choice,
    secretKey,
    process.env.NODE_ENV,
    process.env.PAYSSAM_API_KEY,
    process.env.PAYSSAM_MEMBER,
    process.env.PAYSSAM_MERCHANT,
    process.env.PAYSSAM_BASE_URL,
    process.env.PAYSSAM_CALLBACK_TOKEN,
    process.env.PAYSSAM_BILL_ISSUER,
    process.env.PAYSSAM_BILL_PREFIX,
    process.env.PAYSSAM_TALK,
  ].join("|");
  if (cached?.key === cacheKey) return cached.provider;

  let provider: TuitionProvider | null = null;
  if (choice === "payssam") provider = createPayssam();
  else if (choice === "toss") provider = secretKey ? createTossLinkPayProvider(secretKey) : null;
  else if (isMockProviderEnabled()) provider = createMockProvider();
  else {
    provider = createPayssam();
    if (!provider && secretKey) provider = createTossLinkPayProvider(secretKey);
  }

  cached = { key: cacheKey, provider };
  return provider;
}

/** 학부모 앱·어드민에 "온라인 결제 가능 여부"로 내려 주는 값 */
export function isOnlinePaymentEnabled(): boolean {
  return getTuitionProvider() !== null;
}
