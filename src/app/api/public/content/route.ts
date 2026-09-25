import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { isContentPostType, type ContentPostType } from "@/lib/content-posts-meta";

// 강한선배 랜딩(별도 도메인 정적 사이트)에서 fetch하는 공개 콘텐츠 피드 — 인증 없음.
// GET /api/public/content?type=review,mentor&limit=6
// - type: 쉼표 구분 유형 목록 (review·mentor·director·podcast·article). 생략 시 전체
// - limit: 1~50 (기본 50, 50 초과는 50)
// 본문(body)은 내려주지 않는다 — 상세는 /api/public/content/[id]
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const CACHE_HEADERS = {
  ...CORS_HEADERS,
  "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
};
const MAX_LIMIT = 50;

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  let types: ContentPostType[] | undefined;
  const typeParam = params.get("type")?.trim();
  if (typeParam) {
    const list = [...new Set(typeParam.split(",").map((t) => t.trim()).filter(Boolean))];
    const invalid = list.filter((t) => !isContentPostType(t));
    if (list.length === 0 || invalid.length > 0) {
      return badRequest(`유형이 올바르지 않습니다: ${invalid.join(", ") || typeParam}`);
    }
    types = list as ContentPostType[];
  }

  let take = MAX_LIMIT;
  const limitParam = params.get("limit")?.trim();
  if (limitParam) {
    const n = Number(limitParam);
    if (!Number.isInteger(n) || n < 1) return badRequest("limit 은 1 이상의 정수여야 합니다");
    take = Math.min(n, MAX_LIMIT);
  }

  const rows = await prisma.contentPost.findMany({
    where: { visible: true, ...(types ? { type: { in: types } } : {}) },
    orderBy: { publishedAt: "desc" },
    take,
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
      body: true, // hasBody 계산용 — 응답에는 포함하지 않음
    },
  });

  const posts = rows.map(({ body, ...p }) => ({ ...p, hasBody: !!body?.trim() }));

  return NextResponse.json({ posts }, { headers: CACHE_HEADERS });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
