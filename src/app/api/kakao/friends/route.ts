import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

async function refreshIfNeeded(userId: string, user: { kakaoAccessToken: string; kakaoRefreshToken: string | null; kakaoTokenExpiry: Date | null }) {
  if (!user.kakaoTokenExpiry || user.kakaoTokenExpiry > new Date(Date.now() + 60_000)) {
    return user.kakaoAccessToken;
  }
  if (!user.kakaoRefreshToken) return null;

  const refreshParams: Record<string, string> = {
    grant_type: "refresh_token",
    client_id: process.env.KAKAO_REST_API_KEY!,
    refresh_token: user.kakaoRefreshToken,
  };
  if (process.env.KAKAO_CLIENT_SECRET) refreshParams.client_secret = process.env.KAKAO_CLIENT_SECRET;

  const res = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(refreshParams),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) return null;

  const expiry = new Date(Date.now() + data.expires_in * 1000);
  await prisma.user.update({
    where: { id: userId },
    data: {
      kakaoAccessToken: data.access_token,
      kakaoRefreshToken: data.refresh_token ?? user.kakaoRefreshToken,
      kakaoTokenExpiry: expiry,
    },
  });

  return data.access_token as string;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { kakaoAccessToken: true, kakaoRefreshToken: true, kakaoTokenExpiry: true },
  });

  if (!user?.kakaoAccessToken) {
    return NextResponse.json({ error: "카카오 미연결", connected: false }, { status: 400 });
  }

  const accessToken = await refreshIfNeeded(session.user.id, user as { kakaoAccessToken: string; kakaoRefreshToken: string | null; kakaoTokenExpiry: Date | null });
  if (!accessToken) {
    return NextResponse.json({ error: "토큰 갱신 실패. 다시 연결해주세요", connected: false }, { status: 400 });
  }

  const res = await fetch("https://kapi.kakao.com/v1/api/talk/friends?limit=100", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await res.json();
  if (!res.ok) {
    console.error("[kakao friends]", data);
    return NextResponse.json({ error: data.msg ?? "친구 목록 조회 실패" }, { status: 500 });
  }

  return NextResponse.json({ friends: data.elements ?? [] });
}
