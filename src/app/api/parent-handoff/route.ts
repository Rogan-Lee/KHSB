import type { NextRequest } from "next/server";

import { redeemParentHandoff } from "@/lib/mobile-parent-reports";

export const dynamic = "force-dynamic";

const NO_STORE = "no-store, max-age=0";

/**
 * 학부모 앱 WebView 전용 1회용 핸드오프.
 * GET /api/parent-handoff?n=<nonce> → nonce 소비 + 링크·자녀·리포트 재검증 → 게이트 쿠키(≤1h) → 리포트로 302.
 * (쿠키는 grantGatePass 가 next/headers cookies() 로 심고, Next 가 이 응답에 합쳐 보낸다)
 * 로그인 세션 쿠키는 쓰지도 싣지도 않는다.
 */
export async function GET(request: NextRequest) {
  try {
    const path = await redeemParentHandoff(request.nextUrl.searchParams.get("n"));
    if (!path) return handoffFailure(410);
    // 상대 경로 Location — 쿠키를 심은 바로 그 호스트로 이동
    return new Response(null, {
      status: 302,
      headers: {
        Location: path,
        "Cache-Control": NO_STORE,
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    console.error("[parent-handoff]", error);
    return handoffFailure(500);
  }
}

function handoffFailure(status: number) {
  const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>리포트를 열 수 없어요</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:#f3f4f5;color:#1a1c20;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard",sans-serif}
  main{max-width:360px;padding:32px 24px;text-align:center}
  h1{font-size:18px;line-height:24px;margin:0 0 8px}
  p{font-size:14px;line-height:19px;color:#868b94;margin:0}
</style></head>
<body><main>
  <h1>리포트를 열 수 없어요</h1>
  <p>열람 시간이 지났거나 이미 사용한 링크예요.<br />앱에서 리포트를 다시 눌러 주세요.</p>
</main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": NO_STORE,
      "Referrer-Policy": "no-referrer",
    },
  });
}
