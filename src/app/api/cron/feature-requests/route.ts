import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;

  const requests = await prisma.featureRequest.findMany({
    where: {
      status: { in: ["PENDING", "IN_PROGRESS"] },
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      priority: true,
      status: true,
      requester: true,
      relatedPage: true,
      createdAt: true,
      _count: { select: { comments: true } },
    },
  });

  return NextResponse.json({
    total: requests.length,
    requests: requests.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      comments: r._count.comments,
      _count: undefined,
    })),
  });
}
