import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileParent,
} from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { todayKST } from "@/lib/utils";

const ABSENT_TYPES = new Set(["ABSENT", "APPROVED_ABSENT", "NOTIFIED_ABSENT"]);

function attendanceStatus(record: {
  checkIn: Date | null;
  checkOut: Date | null;
  type: string;
} | null) {
  if (!record) return "미입실";
  if (ABSENT_TYPES.has(record.type)) return "결석";
  if (record.checkOut) return "퇴실";
  if (record.checkIn) return "입실";
  return "미입실";
}

export async function GET(request: NextRequest) {
  try {
    const { children } = await requireMobileParent(request);
    const ids = children.map((child) => child.id);

    const today = todayKST();
    const monthStart = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
    );
    const monthEnd = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1),
    );

    const [attendance, points, reports] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where: { studentId: { in: ids }, date: today },
        select: { checkIn: true, checkOut: true, studentId: true, type: true },
      }),
      prisma.meritDemerit.groupBy({
        by: ["studentId", "type"],
        where: {
          studentId: { in: ids },
          date: { gte: monthStart, lt: monthEnd },
          visibleInReport: true,
        },
        _sum: { points: true },
      }),
      prisma.parentReport.findMany({
        where: {
          studentId: { in: ids },
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, studentId: true },
      }),
    ]);

    return mobileJson({
      children: children.map((child) => {
        const record =
          attendance.find((row) => row.studentId === child.id) ?? null;
        const sumOf = (type: "MERIT" | "DEMERIT") =>
          points.find((p) => p.studentId === child.id && p.type === type)?._sum
            .points ?? 0;
        const latestReport =
          reports.find((report) => report.studentId === child.id) ?? null;

        return {
          ...child,
          todayAttendance: {
            status: attendanceStatus(record),
            checkIn: record?.checkIn?.toISOString() ?? null,
            checkOut: record?.checkOut?.toISOString() ?? null,
          },
          monthPoints: { merit: sumOf("MERIT"), demerit: sumOf("DEMERIT") },
          latestReportAt: latestReport?.createdAt.toISOString() ?? null,
        };
      }),
    });
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
