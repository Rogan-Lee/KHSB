import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, CalendarClock } from "lucide-react";
import { auth } from "@/lib/auth";
import { isFullAccess } from "@/lib/roles";
import { getAiJobQueueOverview } from "@/lib/report-ai-queue";

// AI 텍스트 생성 예약 대기열 — QUEUED 상태 ReportAiJob 목록.
// 야간 Claude 루틴(/api/cron/report-ai-queue)이 오래 대기한 것부터 생성한다.
export const dynamic = "force-dynamic";

export default async function ReportAiQueuePage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  if (!isFullAccess(session.user.role)) redirect("/");

  const rows = await getAiJobQueueOverview();
  const monthly = rows.filter((r) => r.type === "MONTHLY_SUMMARY").length;
  const mentoring = rows.filter((r) => r.type === "MENTORING_COMMENT").length;

  return (
    <div className="space-y-5 p-4 md:p-6 max-w-3xl">
      <header className="space-y-2">
        <Link
          href="/reports/monthly"
          className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          월간 리포트로 돌아가기
        </Link>
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-violet-600" />
          <h1 className="text-2xl font-semibold tracking-[-0.015em]">
            AI 생성 예약 대기열
          </h1>
        </div>
        <p className="text-[13px] text-muted-foreground">
          야간 Claude 루틴이 오래 대기한 것부터 순차 생성합니다. 생성되면 해당 리포트의
          종합의견·코멘트에 자동 반영됩니다.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[13px] text-violet-800">
          대기 총 <b className="tabular-nums">{rows.length}</b>건
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[13px] text-muted-foreground">
          월간 종합의견 <b className="tabular-nums">{monthly}</b> · 멘토링 코멘트{" "}
          <b className="tabular-nums">{mentoring}</b>
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-[12px] border border-dashed p-10 text-center text-[13px] text-muted-foreground">
          대기 중인 예약 생성 항목이 없습니다.
        </div>
      ) : (
        <div className="rounded-[12px] border overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/40 text-muted-foreground text-[11px] uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">학생</th>
                <th className="text-left px-3 py-2 font-semibold">유형</th>
                <th className="text-left px-3 py-2 font-semibold">대상</th>
                <th className="text-left px-3 py-2 font-semibold">대기 시각</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.jobId} className="border-t">
                  <td className="px-3 py-2 font-medium">{r.studentName}</td>
                  <td className="px-3 py-2">
                    <span className="inline-block rounded bg-violet-100 text-violet-800 px-1.5 py-0.5 text-[11px] font-medium">
                      {r.typeLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.periodLabel ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {new Date(r.queuedAt).toLocaleString("ko-KR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
