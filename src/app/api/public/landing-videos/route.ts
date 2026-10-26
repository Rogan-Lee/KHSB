import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  LANDING_VIDEO_EXTRA_MAX,
  LANDING_VIDEOS_KEY,
  parseLandingVideos,
  youtubeId,
} from "@/lib/content-posts-meta";

// 강한선배 랜딩 홈 '영상' 칸 — 인증 없음.
// GET /api/public/landing-videos → { posts: [기본 영상, 추가 영상…] } (유튜브 링크인 공개 팟캐스트만, videoId 포함)
// 어드민 콘텐츠 > 팟캐스트 탭 '홈페이지 영상'에서 고른 순서. 고른 게 없거나 다 비공개면 최신 영상 3개(첫 번째가 기본).
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const CACHE_HEADERS = {
  ...CORS_HEADERS,
  "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
};
const SELECT = {
  id: true,
  title: true,
  summary: true,
  url: true,
  coverImageUrl: true,
  authorName: true,
  authorRole: true,
} as const;

const withVideoId = <T extends { url: string | null }>(rows: T[]) =>
  rows.flatMap((r) => {
    const videoId = youtubeId(r.url);
    return videoId ? [{ ...r, videoId }] : [];
  });

export async function GET() {
  const setting = await prisma.appSetting.findUnique({
    where: { key: LANDING_VIDEOS_KEY },
    select: { value: true },
  });
  const { main, extra } = parseLandingVideos(setting?.value);

  const ids = main ? [main, ...extra] : [];
  const picked = ids.length
    ? await prisma.contentPost.findMany({
        where: { id: { in: ids }, type: "podcast", visible: true },
        select: SELECT,
      })
    : [];
  let posts = withVideoId(ids.flatMap((id) => picked.filter((r) => r.id === id)));
  if (posts.length === 0) {
    const latest = await prisma.contentPost.findMany({
      where: { type: "podcast", visible: true },
      orderBy: { publishedAt: "desc" },
      take: 20,
      select: SELECT,
    });
    posts = withVideoId(latest).slice(0, 1 + LANDING_VIDEO_EXTRA_MAX);
  }

  return NextResponse.json({ posts }, { headers: CACHE_HEADERS });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
