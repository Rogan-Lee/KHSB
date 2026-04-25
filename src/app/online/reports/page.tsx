import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { MessageCircle, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isFullAccess } from "@/lib/roles";
import { mondayOfKST, shiftWeek } from "@/lib/online/week";
import {
  OnlineReportsPanel,
  type OnlineReportRow,
} from "@/components/online/online-reports-panel";
import { ReportsTypeNav } from "@/components/online/reports-type-nav";

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

  const [students, existingReports, reportsWithUnread] = await Promise.all([
    prisma.student.findMany({
      where: { isOnlineManaged: true, status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        grade: true,
        parentEmail: true,
        assignedMentor: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.onlineParentReport.findMany({
      where: { type: "WEEKLY", periodStart: weekStartDate },
      include: {
        approvedBy: { select: { name: true } },
        _count: { select: { feedbacks: { where: { readAt: null } } } },
      },
    }),
    prisma.onlineParentReport.findMany({
      where: { feedbacks: { some: { readAt: null } } },
      select: {
        id: true,
        type: true,
        periodStart: true,
        student: { select: { name: true, grade: true } },
        _count: { select: { feedbacks: { where: { readAt: null } } } },
        feedbacks: {
          where: { readAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const totalUnread = reportsWithUnread.reduce(
    (sum, r) => sum + r._count.feedbacks,
    0
  );

  const reportByStudent = new Map(existingReports.map((r) => [r.studentId, r]));

  const rows: OnlineReportRow[] = students.map((s) => {
    const r = reportByStudent.get(s.id);
    return {
      studentId: s.id,
      studentName: s.name,
      grade: s.grade,
      parentEmail: s.parentEmail,
      assignedMentorName: s.assignedMentor?.name ?? null,
      report: r
        ? {
            id: r.id,
            status: r.status,
            token: r.token,
            markdown:
              ((r.content as unknown as { markdown?: string })?.markdown) ?? "",
            updatedAt: r.updatedAt.toISOString(),
            approvedByName: r.approvedBy?.name ?? null,
            approvedAt: r.approvedAt?.toISOString() ?? null,
            sentAt: r.sentAt?.toISOString() ?? null,
            viewCount: r.viewCount,
            sentChannels: r.sentChannels,
            errorMessage: r.errorMessage,
            unreadFeedbackCount: r._count.feedbacks,
          }
        : null,
    };
  });

  const hdrs = await headers();
  const host = hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink tracking-[-0.015em]">
            학부모 보고서
          </h1>
          <p className="mt-1 text-[13px] text-ink-4">
            AI 초안 자동 생성 · 원장 편집·승인·발송. 좌측에서 학생 선택 → 우측에서 편집.
          </p>
        </div>
        <ReportsTypeNav current="WEEKLY" />
      </header>

      {totalUnread > 0 && (
        <section className="rounded-[12px] border-2 border-amber-300 bg-amber-50 p-4">
          <div className="flex items-center gap-2 mb-2.5">
            <MessageCircle className="h-4 w-4 text-amber-700" />
            <h2 className="text-[13px] font-semibold text-amber-900">
              학부모 피드백 {totalUnread}건 미확인 — 보고서별로 확인하세요
            </h2>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {reportsWithUnread.map((r) => {
              const latest = r.feedbacks[0]?.createdAt;
              return (
                <Link
                  key={r.id}
                  href={`/online/reports/${r.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white border border-amber-300 hover:border-amber-500 hover:bg-amber-100 px-2.5 py-1 text-[12px] text-amber-900 transition-colors"
                  title={
                    latest
                      ? `최신 피드백: ${new Date(latest).toLocaleString("ko-KR")}`
                      : undefined
                  }
                >
                  <span className="font-semibold">{r.student.name}</span>
                  <span className="text-[10.5px] text-amber-700">
                    {r.student.grade}
                  </span>
                  <span className="inline-flex items-center justify-center rounded-full bg-amber-200 text-amber-900 min-w-[18px] h-[18px] px-1 text-[10.5px] font-bold tabular-nums">
                    {r._count.feedbacks}
                  </span>
                  <ChevronRight className="h-3 w-3 text-amber-600" />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <OnlineReportsPanel rows={rows} weekStart={weekStart} origin={origin} />
    </div>
  );
}
