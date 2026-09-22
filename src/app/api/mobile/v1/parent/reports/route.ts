import type { NextRequest } from "next/server";

import { getAppUrl } from "@/lib/app-url";
import {
  mobileApiErrorResponse,
  mobileJson,
  requireParentChild,
} from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const studentId = request.nextUrl.searchParams.get("studentId");
    await requireParentChild(request, studentId);

    const reports = await prisma.parentReport.findMany({
      where: {
        studentId: studentId!,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        createdAt: true,
        customNote: true,
        expiresAt: true,
        id: true,
        token: true,
      },
    });

    return mobileJson({
      items: reports.map((report) => ({
        id: report.id,
        createdAt: report.createdAt.toISOString(),
        expiresAt: report.expiresAt?.toISOString() ?? null,
        hasNote: !!report.customNote,
        url: `${getAppUrl()}/r/${report.token}`,
      })),
    });
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
