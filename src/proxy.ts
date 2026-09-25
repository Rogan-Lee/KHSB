import { getSessionCookie } from "better-auth/cookies";
import { NextRequest, NextResponse } from "next/server";

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
  "/api/auth",
  "/api/mobile/v1/auth",
  "/api/webhooks",
  "/api/cron",
  "/api/public", // 외부 정적 랜딩이 비로그인으로 fetch 하는 공개 콘텐츠 피드
];

export function isPublicPath(pathname: string) {
  return PUBLIC_ROUTE_ROOTS.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
}

export function proxy(request: NextRequest) {
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
