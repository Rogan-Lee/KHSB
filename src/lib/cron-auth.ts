import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * 상수 시간 문자열 비교.
 * 길이가 다른 입력도 누설하지 않도록 양쪽을 SHA-256 으로 고정 길이화한 뒤 비교한다.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

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

  const authHeader = request.headers.get("authorization") ?? "";
  if (!safeEqual(authHeader, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
