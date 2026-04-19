import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const requests = await prisma.featureRequest.findMany({
    where: { status: "PENDING" },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      priority: true,
      relatedPage: true,
      requester: true,
      createdAt: true,
    },
  });

  return NextResponse.json(requests);
}
