import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clearOAuthStateCookie, verifyOAuthState } from "@/lib/oauth-state";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  // CSRF 방어: connect 에서 발급한 state 쿠키와 대조 (공격자 code 로 피해자 계정에 연동 방지)
  const stateOk = verifyOAuthState(request, "kakao", session.user.id);

  if (error || !code || !stateOk) {
    const res = NextResponse.redirect(new URL("/messages?kakao=error", request.url));
    clearOAuthStateCookie(res, "kakao");
    return res;
  }

  const clientId = process.env.KAKAO_REST_API_KEY!;
  const clientSecret = process.env.KAKAO_CLIENT_SECRET;
  const redirectUri = process.env.KAKAO_REDIRECT_URI!;

  try {
    const params: Record<string, string> = {
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: redirectUri,
      code,
    };
    if (clientSecret) params.client_secret = clientSecret;

    const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("[kakao callback] token error:", tokenData);
      return NextResponse.redirect(new URL("/messages?kakao=error", request.url));
    }

    const expiry = new Date(Date.now() + tokenData.expires_in * 1000);

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        kakaoAccessToken: tokenData.access_token,
        kakaoRefreshToken: tokenData.refresh_token ?? null,
        kakaoTokenExpiry: expiry,
      },
    });

    const res = NextResponse.redirect(new URL("/messages?kakao=connected", request.url));
    clearOAuthStateCookie(res, "kakao");
    return res;
  } catch (err) {
    console.error("[kakao callback] error:", err);
    return NextResponse.redirect(new URL("/messages?kakao=error", request.url));
  }
}
