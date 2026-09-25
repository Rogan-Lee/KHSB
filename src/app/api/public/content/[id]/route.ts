import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderContentMarkdown, readingMinutesFromHtml } from "@/lib/content-markdown";

// 공개 콘텐츠 상세 — 강한선배 랜딩(별도 도메인 정적 사이트)의 글 상세 페이지용. 인증 없음.
// 공개(visible) 글만 반환. 본문은 서버에서 안전한 HTML 로 렌더해 bodyHtml 로 내려준다.
export const runtime = "nodejs"; // react-dom/server 렌더 (content-markdown) — edge 불가

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const CACHE_HEADERS = {
  ...CORS_HEADERS,
  "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
};

function notFound() {
  return NextResponse.json(
    { error: "콘텐츠를 찾을 수 없습니다" },
    { status: 404, headers: { ...CORS_HEADERS, "Cache-Control": "s-maxage=60" } }
  );
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!id || id.length > 64) return notFound();

  const post = await prisma.contentPost.findFirst({
    where: { id, visible: true },
    select: {
      id: true,
      type: true,
      title: true,
      summary: true,
      url: true,
      coverImageUrl: true,
      publishedAt: true,
      authorName: true,
      authorRole: true,
      authorKey: true,
      body: true,
    },
  });
  if (!post) return notFound();

  const [bodyHtml, related] = await Promise.all([
    post.body ? renderContentMarkdown(post.body) : Promise.resolve(""),
    prisma.contentPost.findMany({
      where: { visible: true, type: post.type, id: { not: post.id } },
      orderBy: { publishedAt: "desc" },
      take: 3,
      select: {
        id: true,
        type: true,
        title: true,
        summary: true,
        coverImageUrl: true,
        publishedAt: true,
        authorName: true,
      },
    }),
  ]);

  return NextResponse.json(
    {
      post: {
        id: post.id,
        type: post.type,
        title: post.title,
        summary: post.summary,
        url: post.url,
        coverImageUrl: post.coverImageUrl,
        publishedAt: post.publishedAt,
        authorName: post.authorName,
        authorRole: post.authorRole,
        authorKey: post.authorKey,
        bodyHtml,
        readingMinutes: readingMinutesFromHtml(bodyHtml),
      },
      related,
    },
    { headers: CACHE_HEADERS }
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
