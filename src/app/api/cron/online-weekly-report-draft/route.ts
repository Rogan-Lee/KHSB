import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import {
  batchGenerateWeeklyReports,
  notifyBatchComplete,
} from "@/actions/online/parent-reports";
import { mondayOfKST, shiftWeek } from "@/lib/online/week";

// 일요일 KST 10:00 = UTC 01:00 일요일.
// vercel.json: "0 1 * * 0" → 일요일 UTC 01:00
// 당일(일요일) 월요일은 지난 주. 지난 주 월요일 = 오늘 기준 월요일 - 7일.
// 단순화: 호출 시점 기준 "이번 주 월요일" - 7일로 지난 주 범위 잡음.
// maxDuration: Vercel Pro 기본 60s → 300s 로 확장
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;

  // 오늘(일요일 KST 10시) 기준 이번 주 월요일 → 그게 "이번 주 시작".
  // 학부모 주간 보고서는 "방금 끝난 주"를 다루므로 -7일.
  const thisMonday = mondayOfKST();
  const lastMonday = shiftWeek(thisMonday, -1);

  const result = await batchGenerateWeeklyReports({ weekStart: lastMonday });
  await notifyBatchComplete({ weekStartIso: lastMonday, ...result });

  return NextResponse.json({ ok: true, weekStart: lastMonday, ...result });
}
