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
import { CountBadge, PageHeader } from "@/components/backoffice/ui";

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
        school: true,
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
      school: s.school,
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
    <div>
      <PageHeader
        title="학부모 보고서"
        description="AI가 초안을 만들면 편집·승인한 뒤 학부모에게 보내요."
      />
      <ReportsTypeNav current="WEEKLY" />

      {totalUnread > 0 && (
        <section
          aria-label="확인하지 않은 학부모 피드백"
          className="mb-x5 rounded-r4 bg-bg-warning-weak px-x5 py-x4"
        >
          <div className="flex items-center gap-x2">
            <MessageCircle className="size-4 shrink-0 text-fg-warning" aria-hidden />
            <h2 className="t4-bold text-fg-neutral">
              확인하지 않은 학부모 피드백{" "}
              <span className="tabular-nums text-fg-warning">{totalUnread}</span>건
            </h2>
          </div>
          <p className="mt-x0_5 pl-x6 t3-regular text-fg-neutral-muted">
            보고서를 열면 피드백이 확인 처리돼요.
          </p>
          <div className="mt-x3 flex flex-wrap gap-x2 pl-x6">
            {reportsWithUnread.map((r) => {
              const latest = r.feedbacks[0]?.createdAt;
              return (
                <Link
                  key={r.id}
                  href={`/online/reports/${r.id}`}
                  className="inline-flex h-x8 items-center gap-x1_5 rounded-full bg-bg-layer-default pl-x3 pr-x2 t3-medium text-fg-neutral shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)] transition-colors hover:bg-bg-layer-default-pressed"
                  title={
                    latest
                      ? `최신 피드백: ${new Date(latest).toLocaleString("ko-KR")}`
                      : undefined
                  }
                >
                  {r.student.name}
                  <span className="t2-regular text-fg-neutral-subtle">
                    {r.student.grade}
                    {r.type === "MONTHLY" ? " · 월간" : ""}
                  </span>
                  <CountBadge count={r._count.feedbacks} />
                  <ChevronRight className="size-3.5 text-fg-placeholder" aria-hidden />
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
