import { getSessionCookie } from "better-auth/cookies";
import { NextRequest, NextResponse } from "next/server";
import { applyHostRedirect } from "@/lib/apply-domain";

const PUBLIC_ROUTE_ROOTS = [
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/student",
  "/r",
  "/cr",
  "/sp",
  "/s",
  "/meal",
  "/v",
  "/w",
  "/apply",
  // 수강료 청구서 링크 — 앱 없는 학부모가 로그인 없이 연다 (주소의 토큰이 곧 인증)
  "/bill",
  "/api/auth",
  "/api/mobile/v1/auth",
  // 학부모 앱 WebView 1회용 핸드오프 (nonce 로 자체 인증, 세션 쿠키 없음)
  "/api/parent-handoff",
  "/api/webhooks",
  "/api/cron",
  // 시설 장비(사용 통제 동기화) — 세션 쿠키 없이 장비 토큰으로 자체 인증
  "/api/access-agent",
  "/api/public", // 외부 정적 랜딩이 비로그인으로 fetch 하는 공개 콘텐츠 피드
];

export function isPublicPath(pathname: string) {
  return PUBLIC_ROUTE_ROOTS.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
}

export function proxy(request: NextRequest) {
  const applyRedirect = applyHostRedirect(
    request.headers.get("host"),
    request.nextUrl.pathname,
    request.nextUrl.search,
  );
  if (applyRedirect) {
    return NextResponse.redirect(applyRedirect);
  }

  if (isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request, {
    cookiePrefix: "studyroom",
  });
  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // api/access-agent: 시설 장비가 30초마다 부르고 자체 토큰으로 인증한다 — 프록시를 거치지 않게 해 호출 수를 아낀다
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/access-agent|.*\\..*).*)"],
};
