import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { exchangeCodeForTokens } from "@/lib/google-calendar";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await auth();
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (error || !code) {
    return NextResponse.redirect(`${base}/calendar?google_error=cancelled`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    if (!tokens.refresh_token) {
      // refresh_token 없이는 저장 불가 — prompt: "consent" 로 재시도 필요
      return NextResponse.redirect(`${base}/calendar?google_error=no_refresh_token`);
    }

    await prisma.googleCalendarToken.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3600 * 1000),
        connectedBy: session?.user?.name ?? "알 수 없음",
      },
      update: {
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3600 * 1000),
        connectedBy: session?.user?.name ?? "알 수 없음",
      },
    });

    return NextResponse.redirect(`${base}/calendar?google_connected=true`);
  } catch (err) {
    console.error("[Google Calendar] callback error:", err);
    return NextResponse.redirect(`${base}/calendar?google_error=failed`);
  }
}
