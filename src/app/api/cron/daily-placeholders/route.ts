import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { materializeWeeklyPlaceholders } from "@/actions/attendance";
import { todayKST } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * 매일 KST 00:05 (= UTC 15:05) 실행.
 * OutingSchedule(주간 반복 외출 일정) 중 오늘 요일에 해당하는 항목을
 * DailyOuting placeholder (isPlaceholder=true) 로 idempotent insert.
 *
 * 사용자가 실제 외출 시각을 확정하면 isPlaceholder=false 로 승격.
 */
export async function GET(request: NextRequest) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;

  try {
    const result = await materializeWeeklyPlaceholders(todayKST(), {
      skipAuth: true,
    });

    return NextResponse.json({
      ok: true,
      date: todayKST().toISOString().slice(0, 10),
      ...result,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
