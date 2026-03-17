import { auth } from "@/lib/auth";
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

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "friends,talk_message",
  });

  const kakaoAuthUrl = `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;
  return NextResponse.redirect(kakaoAuthUrl);
}
