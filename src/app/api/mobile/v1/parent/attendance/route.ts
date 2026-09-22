import type { NextRequest } from "next/server";

import {
  MobileApiError,
  mobileApiErrorResponse,
  mobileJson,
  requireParentChild,
} from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { todayKST } from "@/lib/utils";

const ABSENT_TYPES = new Set(["ABSENT", "APPROVED_ABSENT", "NOTIFIED_ABSENT"]);

export async function GET(request: NextRequest) {
  try {
    const studentId = request.nextUrl.searchParams.get("studentId");
    const month =
      request.nextUrl.searchParams.get("month") ??
      todayKST().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new MobileApiError("월 형식이 올바르지 않습니다", 400);
    }

    await requireParentChild(request, studentId);

    const start = new Date(`${month}-01T00:00:00.000Z`);
    const end = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
    );

    const records = await prisma.attendanceRecord.findMany({
      where: { studentId: studentId!, date: { gte: start, lt: end } },
      orderBy: { date: "desc" },
      select: { checkIn: true, checkOut: true, date: true, type: true },
    });

    return mobileJson({
      month,
      items: records.map((record) => ({
        date: record.date.toISOString().slice(0, 10),
        status: ABSENT_TYPES.has(record.type)
          ? "결석"
          : record.checkOut
            ? "퇴실"
            : record.checkIn
              ? "입실"
              : "미입실",
        type: record.type,
        checkIn: record.checkIn?.toISOString() ?? null,
        checkOut: record.checkOut?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
