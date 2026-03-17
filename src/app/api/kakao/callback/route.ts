import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(new URL("/messages?kakao=error", request.url));
  }

  const clientId = process.env.KAKAO_REST_API_KEY!;
  const clientSecret = process.env.KAKAO_CLIENT_SECRET ?? "";
  const redirectUri = process.env.KAKAO_REDIRECT_URI!;

  try {
    const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
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

    return NextResponse.redirect(new URL("/messages?kakao=connected", request.url));
  } catch (err) {
    console.error("[kakao callback] error:", err);
    return NextResponse.redirect(new URL("/messages?kakao=error", request.url));
  }
}
