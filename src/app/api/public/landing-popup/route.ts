import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderContentMarkdown } from "@/lib/content-markdown";
import { isLandingPopupLive, LANDING_POPUP_KEY, parseLandingPopup } from "@/lib/landing-popup";

// 강한선배 랜딩 홈 공지 팝업 — 인증 없음.
// GET /api/public/landing-popup → { popup: null } 또는 { popup: { id, title, bodyHtml, cta } }
// 어드민에서 켜져 있고 표시 마지막 날(KST)이 지나지 않았을 때만. 본문은 서버에서 안전한 HTML 로 렌더.
export const runtime = "nodejs"; // react-dom/server 렌더 (content-markdown) — edge 불가

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
// 공지는 켜고 끄는 게 바로 보여야 해서 1분만 캐시
const CACHE_HEADERS = {
  ...CORS_HEADERS,
  "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
};

export async function GET() {
  const setting = await prisma.appSetting.findUnique({
    where: { key: LANDING_POPUP_KEY },
    select: { value: true },
  });
  const p = parseLandingPopup(setting?.value);
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (!p || !isLandingPopupLive(p, today)) {
    return NextResponse.json({ popup: null }, { headers: CACHE_HEADERS });
  }
  return NextResponse.json(
    {
      popup: {
        id: p.updatedAt,
        title: p.title,
        bodyHtml: await renderContentMarkdown(p.body),
        cta: p.ctaLabel && p.ctaUrl ? { label: p.ctaLabel, url: p.ctaUrl } : null,
      },
    },
    { headers: CACHE_HEADERS },
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
