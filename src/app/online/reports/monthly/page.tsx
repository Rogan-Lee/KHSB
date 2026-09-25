import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, MessageCircle, UsersRound } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isFullAccess } from "@/lib/roles";
import {
  currentYearMonthKST,
  formatYearMonth,
  shiftMonth,
} from "@/lib/online/month";
import { ReportsTypeNav } from "@/components/online/reports-type-nav";
import { MonthlyBatchButton } from "@/components/online/monthly-batch-button";
import { MonthlyEnqueueButton } from "@/components/online/monthly-enqueue-button";
import { ReportStatusBadge } from "@/components/online/report-status";
import {
  EmptyState,
  PageHeader,
  StatCard,
  StatCards,
  TableCard,
} from "@/components/backoffice/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function MonthlyReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await getUser();
  if (!isFullAccess(user?.role)) redirect("/online");

  const { month } = await searchParams;
  const yearMonth = month ?? shiftMonth(currentYearMonthKST(), -1); // 기본: 지난 달

  const [y, m] = yearMonth.split("-").map(Number);
  const periodStart = new Date(Date.UTC(y, m - 1, 1));

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
      where: { type: "MONTHLY", periodStart },
      include: {
        _count: { select: { feedbacks: { where: { readAt: null } } } },
      },
    }),
  ]);

  const reportByStudent = new Map(existingReports.map((r) => [r.studentId, r]));
  const createdCount = existingReports.length;

  const sentCount = existingReports.filter((r) => r.status === "SENT").length;
  const reviewCount = existingReports.filter(
    (r) => r.status === "DRAFT" || r.status === "REVIEW"
  ).length;
  const unreadFeedbackTotal = existingReports.reduce(
    (sum, r) => sum + (r._count?.feedbacks ?? 0),
    0
  );

  return (
    <div>
      <PageHeader
        title="학부모 보고서"
        description="월간 보고서는 매월 1일 새벽에 자동으로 만들어져요. 편집은 상세 화면에서 해요."
        actions={
          <>
            <MonthlyEnqueueButton yearMonth={yearMonth} />
            <MonthlyBatchButton yearMonth={yearMonth} />
          </>
        }
      />
      <ReportsTypeNav current="MONTHLY" />

      <div className="flex flex-col gap-x5">
        {/* 월 이동 */}
        <div className="flex flex-wrap items-center gap-x3">
          <div className="inline-flex items-center gap-x0_5 rounded-full bg-bg-neutral-weak p-x0_5">
            <Link
              href={`/online/reports/monthly?month=${shiftMonth(yearMonth, -1)}`}
              aria-label="이전 달"
              title="이전 달"
              className="grid size-x8 place-items-center rounded-full text-fg-neutral-muted transition-colors hover:bg-bg-layer-default hover:text-fg-neutral"
            >
              <ChevronLeft className="size-4" />
            </Link>
            <span className="px-x2 t4-bold tabular-nums text-fg-neutral">
              {formatYearMonth(yearMonth)}
            </span>
            <Link
              href={`/online/reports/monthly?month=${shiftMonth(yearMonth, 1)}`}
              aria-label="다음 달"
              title="다음 달"
              className="grid size-x8 place-items-center rounded-full text-fg-neutral-muted transition-colors hover:bg-bg-layer-default hover:text-fg-neutral"
            >
              <ChevronRight className="size-4" />
            </Link>
          </div>
        </div>

        <StatCards cols={4}>
          <StatCard label="대상 학생" value={students.length} unit="명" />
          <StatCard
            label="생성된 보고서"
            value={createdCount}
            unit="건"
            sub={reviewCount > 0 ? `검토 필요 ${reviewCount}건` : undefined}
          />
          <StatCard
            label="발송 완료"
            value={sentCount}
            unit="건"
            tone={sentCount > 0 ? "ok" : "gray"}
          />
          <StatCard
            label="새 학부모 피드백"
            value={unreadFeedbackTotal}
            unit="건"
            tone={unreadFeedbackTotal > 0 ? "warn" : "gray"}
          />
        </StatCards>

        <TableCard>
          {students.length === 0 ? (
            <EmptyState
              icon={UsersRound}
              title="온라인 관리 학생이 없어요"
              description="학생을 온라인 관리로 등록하면 월간 보고서 대상이 돼요."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>학생</TableHead>
                  <TableHead>관리 멘토</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right">최근 갱신</TableHead>
                  <TableHead className="text-right">열람</TableHead>
                  <TableHead className="w-24 text-right">
                    <span className="sr-only">작업</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((s) => {
                  const report = reportByStudent.get(s.id);
                  const unread = report?._count?.feedbacks ?? 0;
                  return (
                    <TableRow key={s.id} className={report ? "relative cursor-pointer" : undefined}>
                      <TableCell>
                        <span className="inline-flex items-center gap-x1_5 whitespace-nowrap">
                          {report ? (
                            // 행 전체를 누르면 상세로 — 링크 영역을 행 크기로 늘린다
                            <Link
                              href={`/online/reports/${report.id}`}
                              className="t4-medium text-fg-neutral after:absolute after:inset-0 after:content-['']"
                            >
                              {s.name}
                            </Link>
                          ) : (
                            <span className="t4-medium text-fg-neutral">{s.name}</span>
                          )}
                          <span className="t3-regular text-fg-neutral-subtle">{s.grade}</span>
                          {unread > 0 && (
                            <span
                              title={`학부모 의견 ${unread}건 미확인`}
                              className="inline-flex h-x5 items-center gap-x0_5 rounded-full bg-bg-warning-weak px-x1_5 t1-bold tabular-nums text-fg-warning"
                            >
                              <MessageCircle className="size-3" aria-hidden />
                              {unread}
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-fg-neutral-muted">
                        {s.assignedMentor?.name ?? (
                          <span className="text-fg-placeholder">미배정</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {report ? (
                          <ReportStatusBadge status={report.status} />
                        ) : (
                          <span className="t3-regular text-fg-placeholder">없음</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-fg-neutral-muted">
                        {report?.updatedAt
                          ? report.updatedAt.toLocaleDateString("ko-KR")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right text-fg-neutral-muted">
                        {report?.status === "SENT" ? `${report.viewCount}회` : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {report ? (
                          <span className="inline-flex items-center t3-medium text-fg-neutral-subtle">
                            열기
                            <ChevronRight className="size-4" aria-hidden />
                          </span>
                        ) : (
                          <span className="whitespace-nowrap t3-regular text-fg-placeholder">
                            배치 대기
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </TableCard>
      </div>
    </div>
  );
}
