import { getSessionCookie } from "better-auth/cookies";
import { NextRequest, NextResponse } from "next/server";
import { applyHostRedirect } from "@/lib/apply-domain";
import { PORTAL_FILE_COOKIE } from "@/lib/file-access";

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
  // 비공개 첨부 — 서명·세션·매직링크 쿠키로 라우트가 직접 권한을 본다 (확장자 없는 파일도 로그인 화면으로 보내지 않게)
  "/api/files",
];

export function isPublicPath(pathname: string) {
  return PUBLIC_ROUTE_ROOTS.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
}

// 학생 포털(/s/<token>)은 세션 쿠키가 없다 — 비공개 첨부(/api/files)를 열 때 쓰도록 매직링크를 쿠키로 남긴다.
// 비공개 저장소를 켰을 때만. 값 검증은 /api/files 가 validateMagicLink 로 한다.
function rememberPortalToken(request: NextRequest, response: NextResponse) {
  if (!process.env.BLOB_PRIVATE_READ_WRITE_TOKEN) return;
  const [, root, token] = request.nextUrl.pathname.split("/");
  if (root !== "s" || !token || token.length < 20 || token.length > 128) return;
  if (request.cookies.get(PORTAL_FILE_COOKIE)?.value === token) return;
  response.cookies.set(PORTAL_FILE_COOKIE, token, {
    path: "/api/files",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
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

  // 서버 컴포넌트·서버 액션은 자기 주소를 모른다 — 접속 기록(access-log)이 쓰도록 실어 보낸다.
  // 공개 경로도 덮어쓴다: 서버 액션은 아무 주소로나 보낼 수 있어, 비워 두면 기록을 피할 수 있다.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  if (isPublicPath(request.nextUrl.pathname)) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    rememberPortalToken(request, response);
    return response;
  }

  const sessionCookie = getSessionCookie(request, {
    cookiePrefix: "studyroom",
  });
  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // api/access-agent: 시설 장비가 30초마다 부르고 자체 토큰으로 인증한다 — 프록시를 거치지 않게 해 호출 수를 아낀다
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/access-agent|.*\\..*).*)"],
};
