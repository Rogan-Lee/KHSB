import crypto from "crypto";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";

// ───────────────────── 만료 정책 ─────────────────────

export const REPORT_TOKEN_VALID_DAYS = 30;   // /r, /sp, /cr
export const VOCAB_TOKEN_VALID_DAYS = 14;    // /v

export function reportExpiresAt(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + REPORT_TOKEN_VALID_DAYS);
  return d;
}

export function vocabExpiresAt(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + VOCAB_TOKEN_VALID_DAYS);
  return d;
}

// ───────────────────── 토큰 검증 결과 ─────────────────────

export type TokenValidationFailure =
  | "not_found"
  | "expired"
  | "revoked";

export type TokenAccessSnapshot = {
  expiresAt: Date | null;
  revokedAt: Date | null;
};

/**
 * 만료/취소 여부를 통일 규칙으로 판정.
 * - revokedAt 우선
 * - expiresAt = null 은 **레거시(이 기능 도입 이전 발급분)** 로 보고 통과시킨다.
 *   배포·마이그레이션 시점에 학부모에게 이미 전달된 링크가 한꺼번에 무효화되는 사고를
 *   원천 차단하기 위함. 운영자가 backfill-token-expiry 스크립트를 돌리면 NULL 행에
 *   +30/+14일 만료가 채워지고, 그 이후 발급은 코드에서 expiresAt 을 항상 세팅하므로
 *   레거시 NULL 은 시간이 지나면 자연히 사라진다.
 */
export function checkExpiry(
  snapshot: TokenAccessSnapshot,
  now: Date = new Date()
): TokenValidationFailure | null {
  if (snapshot.revokedAt) return "revoked";
  if (!snapshot.expiresAt) return null; // legacy — backfill 전까지 보존
  if (snapshot.expiresAt.getTime() < now.getTime()) return "expired";
  return null;
}

// ───────────────────── 요청 메타데이터 ─────────────────────

export async function getRequestMeta(): Promise<{ ip: string | null; ua: string | null }> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  const ip = xff ? xff.split(",")[0]!.trim() : h.get("x-real-ip");
  const ua = h.get("user-agent");
  return { ip: ip || null, ua: ua || null };
}

// ───────────────────── 본인 확인 게이트 ─────────────────────

export type GateScope = "STUDENT" | "PARENT";

const GATE_COOKIE_PREFIX = "mlgate";
const GATE_MAX_FAILURES = 5;
const GATE_LOCKOUT_MINUTES = 10;

function getGateSecret(): string {
  const secret = process.env.MAGIC_LINK_GATE_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "MAGIC_LINK_GATE_SECRET 환경변수가 설정되지 않았습니다 (16자 이상 필수)"
    );
  }
  // dev only fallback — never reach prod
  return "dev-only-insecure-gate-secret-do-not-use-in-prod";
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function shortTokenId(token: string): string {
  return hashToken(token).slice(0, 12);
}

function gateCookieName(scope: GateScope, token: string): string {
  return `${GATE_COOKIE_PREFIX}_${scope.toLowerCase()}_${shortTokenId(token)}`;
}

function gateSignature(scope: GateScope, token: string, subjectId: string): string {
  return crypto
    .createHmac("sha256", getGateSecret())
    .update(`${scope}:${token}:${subjectId}`)
    .digest("hex");
}

export async function hasGatePass(
  scope: GateScope,
  token: string,
  subjectId: string
): Promise<boolean> {
  const jar = await cookies();
  const cookie = jar.get(gateCookieName(scope, token));
  if (!cookie?.value) return false;
  const expected = gateSignature(scope, token, subjectId);
  try {
    const a = Buffer.from(cookie.value, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function grantGatePass(
  scope: GateScope,
  token: string,
  subjectId: string,
  expiresAt: Date
): Promise<void> {
  const jar = await cookies();
  jar.set({
    name: gateCookieName(scope, token),
    value: gateSignature(scope, token, subjectId),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export async function clearGatePass(scope: GateScope, token: string): Promise<void> {
  const jar = await cookies();
  jar.delete(gateCookieName(scope, token));
}

// ───────────────────── 시도 제한 ─────────────────────

/**
 * 최근 GATE_LOCKOUT_MINUTES 안에 GATE_MAX_FAILURES 회 이상 실패 시 잠금.
 * 토큰 단위 / IP 단위 둘 다 본다 (어느 한쪽이라도 초과면 잠금).
 */
export async function isGateLocked(
  scope: GateScope,
  token: string,
  ip: string | null
): Promise<boolean> {
  const since = new Date(Date.now() - GATE_LOCKOUT_MINUTES * 60 * 1000);
  const tokenHash = hashToken(token);
  const [byToken, byIp] = await Promise.all([
    prisma.tokenGateAttempt.count({
      where: { scope, tokenHash, failedAt: { gte: since } },
    }),
    ip
      ? prisma.tokenGateAttempt.count({
          where: { scope, ip, failedAt: { gte: since } },
        })
      : Promise.resolve(0),
  ]);
  return byToken >= GATE_MAX_FAILURES || byIp >= GATE_MAX_FAILURES;
}

export async function recordGateFailure(
  scope: GateScope,
  token: string,
  ip: string | null,
  ua: string | null
): Promise<void> {
  await prisma.tokenGateAttempt
    .create({
      data: {
        scope,
        tokenHash: hashToken(token),
        ip,
        ua,
      },
    })
    .catch(() => {});
}

// ───────────────────── 게이트 검증 정규화 ─────────────────────

/** 입력 문자열에서 숫자만 추출 (전화번호 게이트용). */
export function normalizeDigits(input: string): string {
  return (input || "").replace(/\D+/g, "");
}

/** Date → YYMMDD 6자리. */
export function birthDateToYYMMDD(birthDate: Date): string {
  const y = birthDate.getUTCFullYear() % 100;
  const m = birthDate.getUTCMonth() + 1;
  const d = birthDate.getUTCDate();
  return `${String(y).padStart(2, "0")}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;
}

/** 전화번호 뒷 4자리 추출. */
export function phoneLast4(phone: string | null | undefined): string | null {
  const digits = normalizeDigits(phone ?? "");
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

/** 사용자 입력과 정답 문자열을 timing-safe 비교. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return crypto.timingSafeEqual(ab, bb);
}
