import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isFullAccess } from "@/lib/roles";
import { mondayOfKST, shiftWeek, formatWeekRange } from "@/lib/online/week";
import { ReportBatchButton } from "@/components/online/report-batch-button";
import type { OnlineReportStatus } from "@/generated/prisma";

const STATUS_LABEL: Record<OnlineReportStatus, string> = {
  DRAFT: "초안",
  DRAFT_FAILED: "생성 실패",
  REVIEW: "편집 중",
  APPROVED: "승인 완료",
  SENT: "발송 완료",
};

const STATUS_COLORS: Record<OnlineReportStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  DRAFT_FAILED: "bg-red-100 text-red-800",
  REVIEW: "bg-amber-100 text-amber-800",
  APPROVED: "bg-blue-100 text-blue-800",
  SENT: "bg-emerald-100 text-emerald-800",
};

export default async function ReportsDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const user = await getUser();
  if (!isFullAccess(user?.role)) redirect("/online");

  const { week } = await searchParams;
  const weekStart = week ?? shiftWeek(mondayOfKST(), -1); // 기본: 지난 주

  const weekStartDate = new Date(weekStart + "T00:00:00.000Z");

  const [students, existingReports] = await Promise.all([
    prisma.student.findMany({
      where: { isOnlineManaged: true, status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        grade: true,
        assignedMentor: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.onlineParentReport.findMany({
      where: { type: "WEEKLY", periodStart: weekStartDate },
    }),
  ]);

  const reportByStudent = new Map(existingReports.map((r) => [r.studentId, r]));

  const statusCounts = existingReports.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {} as Partial<Record<OnlineReportStatus, number>>);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-ink tracking-[-0.015em]">
          학부모 주간 보고서
        </h1>
        <p className="mt-1 text-[13px] text-ink-4">
          원장 검토 · 편집 · 승인 · 발송. AI 초안은 매주 일요일 10시 자동 생성됩니다.
        </p>
      </header>

      <section className="flex items-center justify-between rounded-[12px] border border-line bg-panel px-3 py-2">
        <Link
          href={`/online/reports?week=${shiftWeek(weekStart, -1)}`}
          className="p-1.5 rounded-[6px] text-ink-3 hover:text-ink hover:bg-canvas-2"
          title="이전 주"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="text-[13px] font-semibold text-ink tabular-nums">
          {formatWeekRange(weekStart)}
        </div>
        <Link
          href={`/online/reports?week=${shiftWeek(weekStart, 1)}`}
          className="p-1.5 rounded-[6px] text-ink-3 hover:text-ink hover:bg-canvas-2"
          title="다음 주"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2 text-[11.5px]">
          {(Object.keys(STATUS_LABEL) as OnlineReportStatus[]).map((s) => (
            <span
              key={s}
              className={`inline-block rounded-full px-2.5 py-0.5 font-medium ${STATUS_COLORS[s]}`}
            >
              {STATUS_LABEL[s]} {statusCounts[s] ?? 0}
            </span>
          ))}
        </div>
        <ReportBatchButton weekStart={weekStart} />
      </section>

      {students.length === 0 ? (
        <div className="rounded-[12px] border border-line bg-panel p-8 text-center text-[13px] text-ink-4">
          온라인 관리 학생이 없습니다.
        </div>
      ) : (
        <div className="rounded-[12px] border border-line bg-panel overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead className="bg-canvas-2 text-ink-4 text-[11px] uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">학생</th>
                <th className="text-left px-3 py-2 font-semibold">관리 멘토</th>
                <th className="text-left px-3 py-2 font-semibold">상태</th>
                <th className="text-left px-3 py-2 font-semibold">최근 갱신</th>
                <th className="text-left px-3 py-2 font-semibold">열람</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const report = reportByStudent.get(s.id);
                return (
                  <tr key={s.id} className="border-t border-line hover:bg-canvas-2/50">
                    <td className="px-3 py-2 font-medium text-ink">
                      {s.name}
                      <span className="ml-1 text-[11px] text-ink-5">({s.grade})</span>
                    </td>
                    <td className="px-3 py-2 text-ink-3">
                      {s.assignedMentor?.name ?? <span className="text-ink-5">미배정</span>}
                    </td>
                    <td className="px-3 py-2">
                      {report ? (
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_COLORS[report.status]}`}
                        >
                          {STATUS_LABEL[report.status]}
                        </span>
                      ) : (
                        <span className="text-[11px] text-ink-5">없음</span>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-ink-3">
                      {report?.updatedAt
                        ? report.updatedAt.toLocaleDateString("ko-KR")
                        : "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-ink-3">
                      {report?.status === "SENT"
                        ? `${report.viewCount}회`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {report ? (
                        <Link
                          href={`/online/reports/${report.id}`}
                          className="text-[12px] text-ink-3 hover:text-ink hover:underline"
                        >
                          열기
                        </Link>
                      ) : (
                        <span className="text-[11px] text-ink-5">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
