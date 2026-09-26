import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

/**
 * OAuth `state` CSRF 방어 헬퍼 (Kakao / Google Calendar 연동).
 *
 * - 연동 시작 라우트: createOAuthState() 로 랜덤 state 생성 → 인가 URL 에 state 로 싣고,
 *   setOAuthStateCookie() 로 사용자 id 에 바인딩된 HMAC 서명 쿠키를 심는다.
 * - 콜백 라우트: verifyOAuthState() 로 쿼리 state == 쿠키 state 이고 서명이 현재 로그인 사용자와
 *   일치하는지 확인한다. 공격자가 자기 계정의 code 로 만든 콜백 URL 을 피해자에게 열게 해
 *   피해자 계정(또는 시설 공용 토큰)에 공격자 계정을 연동시키는 login-CSRF 를 막는다.
 */

const MAX_AGE_SEC = 10 * 60;

type Provider = "kakao" | "google";

function getSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") {
    return "studyroom-development-secret-change-before-production";
  }
  throw new Error("BETTER_AUTH_SECRET 또는 AUTH_SECRET 환경변수가 필요합니다");
}

function cookieName(provider: Provider) {
  return `studyroom.oauth_state_${provider}`;
}

function sign(provider: Provider, state: string, userId: string): string {
  return createHmac("sha256", getSecret())
    .update(`${provider}|${state}|${userId}`)
    .digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function createOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function setOAuthStateCookie(
  res: NextResponse,
  provider: Provider,
  state: string,
  userId: string,
) {
  res.cookies.set(cookieName(provider), `${state}.${sign(provider, state, userId)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // OAuth 제공자 → 콜백은 top-level GET 이동이므로 Lax 로 전송된다
    sameSite: "lax",
    path: "/api",
    maxAge: MAX_AGE_SEC,
  });
}

export function clearOAuthStateCookie(res: NextResponse, provider: Provider) {
  res.cookies.set(cookieName(provider), "", { path: "/api", maxAge: 0 });
}

export function verifyOAuthState(
  request: NextRequest,
  provider: Provider,
  userId: string,
): boolean {
  const stateParam = request.nextUrl.searchParams.get("state");
  const raw = request.cookies.get(cookieName(provider))?.value;
  if (!stateParam || !raw) return false;

  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return false;
  const cookieState = raw.slice(0, dot);
  const cookieSig = raw.slice(dot + 1);

  if (!safeEqual(cookieState, stateParam)) return false;
  return safeEqual(cookieSig, sign(provider, cookieState, userId));
}
