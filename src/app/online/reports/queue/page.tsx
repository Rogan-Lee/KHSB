import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, CalendarClock } from "lucide-react";
import { getUser } from "@/lib/auth";
import { isFullAccess } from "@/lib/roles";
import { getQueueOverview } from "@/lib/online/report-queue";

// 예약 생성 대기열 — QUEUED 상태 보고서 목록.
// 야간 Claude 루틴(5시간 간격, 회당 30건)이 오래 대기한 것부터 생성한다.
export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  WEEKLY: "주간",
  MONTHLY: "월간",
  ADHOC: "수시",
};

export default async function ReportQueuePage() {
  const user = await getUser();
  if (!isFullAccess(user?.role)) redirect("/online");

  const rows = await getQueueOverview();
  const weekly = rows.filter((r) => r.type === "WEEKLY").length;
  const monthly = rows.filter((r) => r.type === "MONTHLY").length;

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <Link
          href="/online/reports"
          className="inline-flex items-center gap-1 text-[13px] text-ink-4 hover:text-ink"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          보고서로 돌아가기
        </Link>
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-violet-600" />
          <h1 className="text-2xl font-semibold text-ink tracking-[-0.015em]">
            예약 생성 대기열
          </h1>
        </div>
        <p className="text-[13px] text-ink-4">
          야간 Claude 루틴이 5시간 간격으로 회당 최대 30건씩, 오래 대기한 것부터 생성합니다.
          생성되면 자동으로 <b>초안</b> 상태가 되어 검토·승인·발송할 수 있습니다.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[13px] text-violet-800">
          대기 총 <b className="tabular-nums">{rows.length}</b>건
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[13px] text-ink-3">
          주간 <b className="tabular-nums">{weekly}</b> · 월간{" "}
          <b className="tabular-nums">{monthly}</b>
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-line p-10 text-center text-[13px] text-ink-4">
          대기 중인 예약 생성 항목이 없습니다.
          <br />
          보고서 화면에서 학생을 선택해 <b>예약 등록</b>하면 여기에 표시됩니다.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[12px] border border-line">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/40 text-ink-4">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">학생</th>
                <th className="px-4 py-2.5 text-left font-medium">학년</th>
                <th className="px-4 py-2.5 text-left font-medium">종류</th>
                <th className="px-4 py-2.5 text-left font-medium">기간</th>
                <th className="px-4 py-2.5 text-left font-medium">등록 시각</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.reportId} className="hover:bg-muted/20">
                  <td className="px-4 py-2.5 font-medium text-ink">
                    {r.studentName}
                  </td>
                  <td className="px-4 py-2.5 text-ink-3">
                    {r.studentGrade ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-block rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                      {TYPE_LABEL[r.type] ?? r.type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-ink-3 tabular-nums">
                    {r.periodStart} ~ {r.periodEnd}
                  </td>
                  <td className="px-4 py-2.5 text-ink-4 tabular-nums">
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
