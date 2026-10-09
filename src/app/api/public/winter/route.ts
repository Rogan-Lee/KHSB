import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { maskReservationName } from "@/lib/waitlist-winter";

// 강한선배 랜딩 윈터스쿨 페이지(recruit.html)가 fetch 하는 예약 현황 — 인증 없음.
// GET /api/public/winter → { remaining: number | null, recent: string[] }
// - remaining: 잔여 좌석 = 지점 정원 − 등원확정 수. 대기자 관리 > 지점 설정에 보이는 '잔여'와 같은 숫자.
//   정원을 설정한 지점이 없으면 null (랜딩은 숫자 대신 "좌석 한정"을 그대로 둔다)
// - recent: 윈터 시즌 입실을 신청한 대기자의 성만 남긴 이름("정○○"), 최신순.
//   실제 신청 내역만 내려준다 — 없으면 빈 배열 (랜딩은 예약 현황 줄을 숨긴다)
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const CACHE_HEADERS = {
  ...CORS_HEADERS,
  "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
};
const RECENT_LIMIT = 12;

export async function GET() {
  const [branches, enrolled, winterEntries] = await Promise.all([
    prisma.branch.findMany({
      where: { isActive: true, capacity: { not: null } },
      select: { id: true, capacity: true },
    }),
    prisma.waitlist.groupBy({
      by: ["branchId"],
      where: { status: "ENROLLED" },
      _count: { _all: true },
    }),
    prisma.waitlist.findMany({
      where: {
        kind: "WAITLIST",
        entryPreference: "winter",
        status: { not: "CANCELLED" },
        phoneVerifiedAt: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT * 2, // 한글 이름이 아닌 신청은 빠지므로 여유 있게
      select: { name: true },
    }),
  ]);

  const enrolledByBranch = new Map(enrolled.map((g) => [g.branchId, g._count._all]));
  const remaining =
    branches.length > 0
      ? branches.reduce((sum, b) => sum + Math.max(0, (b.capacity ?? 0) - (enrolledByBranch.get(b.id) ?? 0)), 0)
      : null;

  const recent = winterEntries
    .map((e) => maskReservationName(e.name))
    .filter((name): name is string => name !== null)
    .slice(0, RECENT_LIMIT);

  return NextResponse.json({ remaining, recent }, { headers: CACHE_HEADERS });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
