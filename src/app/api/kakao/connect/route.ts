import { auth } from "@/lib/auth";
import { createOAuthState, setOAuthStateCookie } from "@/lib/oauth-state";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.KAKAO_REST_API_KEY;
  const redirectUri = process.env.KAKAO_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: "KAKAO_REST_API_KEY 또는 KAKAO_REDIRECT_URI 환경변수가 없습니다" }, { status: 500 });
  }

  // CSRF 방어: 로그인 사용자에 바인딩된 state (콜백에서 검증)
  const state = createOAuthState();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "friends,talk_message",
    state,
  });

  const kakaoAuthUrl = `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;
  const res = NextResponse.redirect(kakaoAuthUrl);
  setOAuthStateCookie(res, "kakao", state, session.user.id);
  return res;
}
