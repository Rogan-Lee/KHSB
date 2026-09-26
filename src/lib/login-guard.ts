// 로그인 무차별 대입 방어 — 계정(아이디·이메일) 단위 실패 횟수 제한.
//
// IP 단위 제한(better-auth rateLimit)은 독서실처럼 학생 수십 명이 한 공인 IP 를 쓰는 환경 때문에
// 느슨하게 둘 수밖에 없고, 여러 IP 로 나눠 시도하는 대입도 막지 못한다. 그래서 계정마다
// 최근 LOGIN_LOCK_MINUTES 분 동안의 실패가 LOGIN_MAX_FAILURES 회를 넘으면 그 계정의 로그인을 잠시 막는다.
//
// 기록은 TokenGateAttempt 를 재사용한다 (scope "LOGIN", tokenHash = SHA-256(정규화한 아이디)).
// 순서는 token-auth.ts reserveGateAttempt 와 같은 insert-then-count — 동시 요청으로 상한을 넘기지 못하게
// 비교 전에 시도 행을 먼저 기록하고, 로그인에 성공하면 그 계정의 실패 기록을 지운다.

import crypto from "crypto";

import { prisma } from "@/lib/prisma";

export const LOGIN_MAX_FAILURES = 10;
export const LOGIN_LOCK_MINUTES = 15;
export const LOGIN_LOCKED_MESSAGE = `로그인 시도가 너무 많아요. ${LOGIN_LOCK_MINUTES}분 후 다시 시도해 주세요.`;

const SCOPE = "LOGIN";

/** 계정 단위 제한을 거는 better-auth 경로 */
export const GUARDED_SIGN_IN_PATHS = ["/sign-in/username", "/sign-in/email"] as const;

export function isGuardedSignInPath(path: string): boolean {
  return (GUARDED_SIGN_IN_PATHS as readonly string[]).includes(path);
}

/** 요청 본문에서 로그인 아이디를 꺼내 정규화 (better-auth 도 아이디·이메일을 소문자로 비교한다) */
export function loginIdentifier(path: string, body: unknown): string | null {
  const b = (body ?? {}) as { username?: unknown; email?: unknown };
  const raw = path === "/sign-in/username" ? b.username : b.email;
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  return value && value.length <= 320 ? value : null;
}

function identifierHash(identifier: string): string {
  return crypto.createHash("sha256").update(`login:${identifier}`).digest("hex");
}

/**
 * 시도 선점. 잠겨 있으면 선점 행을 지우고 locked 를 돌려준다 (잠긴 동안의 요청은 잠금을 늘리지 않음).
 * 통과하면 로그인 결과에 따라 completeLoginAttempt 를 부른다 — 실패면 선점 행이 실패 기록으로 남는다.
 */
export async function reserveLoginAttempt(
  identifier: string,
  ip: string | null,
): Promise<{ locked: true } | { locked: false; attemptId: string }> {
  const tokenHash = identifierHash(identifier);
  const row = await prisma.tokenGateAttempt.create({
    data: { scope: SCOPE, tokenHash, ip },
    select: { id: true },
  });
  const since = new Date(Date.now() - LOGIN_LOCK_MINUTES * 60 * 1000);
  const count = await prisma.tokenGateAttempt.count({
    where: { scope: SCOPE, tokenHash, failedAt: { gte: since } },
  });
  // 방금 기록한 자기 행 포함 → 이전 실패가 상한 이상이면 잠금
  if (count > LOGIN_MAX_FAILURES) {
    await prisma.tokenGateAttempt.deleteMany({ where: { id: row.id } }).catch(() => {});
    return { locked: true };
  }
  return { locked: false, attemptId: row.id };
}

/** 로그인 성공 시 그 계정의 실패 기록(선점 행 포함)을 지운다. 실패면 아무것도 하지 않는다. */
export async function completeLoginAttempt(identifier: string, succeeded: boolean): Promise<void> {
  if (!succeeded) return;
  await prisma.tokenGateAttempt
    .deleteMany({ where: { scope: SCOPE, tokenHash: identifierHash(identifier) } })
    .catch(() => {});
}

/** 클라이언트 IP (기록용) — Vercel 이 x-forwarded-for 를 덮어쓰므로 첫 값을 쓴다 (token-auth getRequestMeta 와 같은 기준) */
export function clientIpFrom(headers: Headers | undefined | null): string | null {
  const raw = headers?.get("x-forwarded-for") ?? headers?.get("x-real-ip") ?? null;
  const ip = raw?.split(",")[0]?.trim();
  return ip ? ip.slice(0, 64) : null;
}
