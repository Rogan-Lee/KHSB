import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isFullAccess } from "@/lib/roles";
import { exchangeCodeForTokens } from "@/lib/google-calendar";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await auth();
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // 인증 및 권한 검증: DIRECTOR/ADMIN만 Google Calendar 연동 가능
  if (!session?.user || !isFullAccess(session.user.role)) {
    return NextResponse.redirect(`${base}/calendar?google_error=unauthorized`);
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(`${base}/calendar?google_error=cancelled`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    if (!tokens.refresh_token) {
      return NextResponse.redirect(`${base}/calendar?google_error=no_refresh_token`);
    }

    await prisma.googleCalendarToken.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3600 * 1000),
        connectedBy: session.user.name ?? "알 수 없음",
      },
      update: {
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3600 * 1000),
        connectedBy: session.user.name ?? "알 수 없음",
      },
    });

    return NextResponse.redirect(`${base}/calendar?google_connected=true`);
  } catch (err) {
    console.error("[Google Calendar] callback error:", err);
    return NextResponse.redirect(`${base}/calendar?google_error=failed`);
  }
}
