import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileParent,
} from "@/lib/mobile-auth";
import { latestParentReportDates } from "@/lib/mobile-parent-reports";
import {
  getOpenTuitionByStudent,
  tuitionBannerOf,
  type OpenTuition,
} from "@/lib/mobile-parent-tuition";
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

    const [attendance, points, legacyReports, reports, tuition] = await Promise.all([
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
      // 구버전 앱 호환: latestReportAt 은 예전 기준(취소·만료 안 된 멘토링 리포트) 그대로.
      // 자녀별 최신 시각만 쓰므로 리포트 전체 대신 groupBy _max
      prisma.parentReport.groupBy({
        by: ["studentId"],
        where: {
          studentId: { in: ids },
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        _max: { createdAt: true },
      }),
      // 새 앱: 5종 리포트 모두 (공유 링크 만료와 무관 — 리포트함과 같은 기준)
      latestParentReportDates(ids),
      // 새 앱: 홈 수강료 배너. 나중에 덧붙인 값이라 조회가 실패해도 홈은 그대로 내려 준다 (배너만 숨김)
      getOpenTuitionByStudent(ids).catch((error) => {
        console.error("[tuition:overview]", error instanceof Error ? error.message : error);
        return new Map<string, OpenTuition[]>();
      }),
    ]);

    return mobileJson({
      children: children.map((child) => {
        const record =
          attendance.find((row) => row.studentId === child.id) ?? null;
        const sumOf = (type: "MERIT" | "DEMERIT") =>
          points.find((p) => p.studentId === child.id && p.type === type)?._sum
            .points ?? 0;
        const latestReportAt =
          legacyReports.find((report) => report.studentId === child.id)?._max.createdAt ?? null;
        const latestAnyReportAt = reports.get(child.id) ?? null;

        return {
          ...child,
          todayAttendance: {
            status: attendanceStatus(record),
            checkIn: record?.checkIn?.toISOString() ?? null,
            checkOut: record?.checkOut?.toISOString() ?? null,
          },
          monthPoints: { merit: sumOf("MERIT"), demerit: sumOf("DEMERIT") },
          latestReportAt: latestReportAt?.toISOString() ?? null,
          latestAnyReportAt: latestAnyReportAt?.toISOString() ?? null,
          tuition: tuitionBannerOf(tuition.get(child.id)),
        };
      }),
    });
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
