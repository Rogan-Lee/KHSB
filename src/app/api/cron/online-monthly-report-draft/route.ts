import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { batchGenerateMonthlyReports } from "@/actions/online/parent-reports";
import { notifySlack } from "@/lib/slack";
import { currentYearMonthKST, shiftMonth } from "@/lib/online/month";

// 매월 말일 KST 10:00 실행 → 지난 달 보고서 생성.
// vercel.json: "0 1 L * *" 는 Vercel cron 에서 지원 안 함 → 매월 1일 UTC 01:00(= KST 10:00)
// 에 실행하고 "직전 달" 을 처리한다.
// vercel.json: "0 1 1 * *"
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;

  // 오늘이 새 달의 1일이므로 yearMonth = 이전 달
  const thisMonth = currentYearMonthKST();
  const lastMonth = shiftMonth(thisMonth, -1);

  const result = await batchGenerateMonthlyReports({ yearMonth: lastMonth });
  const emoji = result.failed === 0 ? "✅" : "⚠️";
  await notifySlack(
    `${emoji} 학부모 월간 보고서 초안 생성 완료 — ${lastMonth}\n` +
      `총 ${result.total}명 · 성공 ${result.success} · 실패 ${result.failed}\n` +
      `_원장 검토: /online/reports?type=MONTHLY&month=${lastMonth}_`
  );
  return NextResponse.json({ ok: true, yearMonth: lastMonth, ...result });
}
