import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildGoogleAuthUrl, isOAuthAppConfigured } from "@/lib/google-calendar";
import { createOAuthState, setOAuthStateCookie } from "@/lib/oauth-state";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (session.user.role !== "DIRECTOR" && session.user.role !== "SUPER_ADMIN") {
    // 연동은 원장 전용 — 버튼이 보이는 다른 직원에게는 기존과 같은 안내 배너로 돌려보낸다
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return NextResponse.redirect(`${base}/calendar?google_error=unauthorized`);
  }
  if (!isOAuthAppConfigured()) {
    return new NextResponse("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI 환경변수를 설정해주세요", { status: 500 });
  }

  // CSRF 방어: 로그인 사용자에 바인딩된 state (콜백에서 검증)
  const state = createOAuthState();
  const res = NextResponse.redirect(buildGoogleAuthUrl(state));
  setOAuthStateCookie(res, "google", state, session.user.id);
  return res;
}
