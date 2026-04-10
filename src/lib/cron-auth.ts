import { NextRequest, NextResponse } from "next/server";

/**
 * Cron API route 인증 헬퍼.
 * Authorization: Bearer <CRON_SECRET> 헤더를 검증한다.
 * 유효하지 않으면 401 응답을 반환, 유효하면 null을 반환.
 */
export function verifyCronSecret(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET이 설정되지 않았습니다" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
