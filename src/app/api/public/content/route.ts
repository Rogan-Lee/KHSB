import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 강한선배 랜딩(별도 도메인 정적 사이트)에서 fetch하는 공개 콘텐츠 피드 — 인증 없음.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function GET() {
  const posts = await prisma.contentPost.findMany({
    where: { visible: true },
    orderBy: { publishedAt: "desc" },
    take: 50,
    select: {
      id: true,
      type: true,
      title: true,
      summary: true,
      url: true,
      coverImageUrl: true,
      publishedAt: true,
    },
  });

  return NextResponse.json(
    { posts },
    {
      headers: {
        ...CORS_HEADERS,
        "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
