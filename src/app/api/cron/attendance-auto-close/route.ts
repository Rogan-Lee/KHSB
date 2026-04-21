import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { todayKST } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * 매일 KST 00:30 (= UTC 15:30)에 실행되어,
 * 어제 입실 기록은 있지만 퇴실 기록이 없는 Attendance row를
 * 어제 23:59:59 KST로 자동 퇴실 처리한다.
 */
export async function GET(request: NextRequest) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;

  const today = todayKST();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  const cutoff = new Date(`${yesterdayStr}T23:59:59+09:00`);

  const result = await prisma.attendanceRecord.updateMany({
    where: {
      date: yesterday,
      checkIn: { not: null },
      checkOut: null,
      isAutoClosed: false,
    },
    data: {
      checkOut: cutoff,
      isAutoClosed: true,
    },
  });

  return NextResponse.json({
    ok: true,
    date: yesterdayStr,
    closedCount: result.count,
  });
}
