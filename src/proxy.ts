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
  "/v",
  "/w",
  "/api/auth",
  "/api/mobile/v1/auth",
  "/api/webhooks",
  "/api/cron",
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
