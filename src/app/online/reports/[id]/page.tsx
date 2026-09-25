import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { MessageCircle, ChevronDown } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isFullAccess } from "@/lib/roles";
import { ReportEditor } from "@/components/online/report-editor";
import { MonthlyExamSelector } from "@/components/online/monthly-exam-selector";
import { ReportStatusBadge } from "@/components/online/report-status";
import { EmptyState, PageHeader, Section, StatusBadge } from "@/components/backoffice/ui";

export default async function ReportEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUser();
  if (!isFullAccess(user?.role)) redirect("/online");

  // 1) fetch — readAt 그대로 (이번 진입에서 미확인이었던 항목 식별 가능)
  const report = await prisma.onlineParentReport.findUnique({
    where: { id },
    include: {
      student: { select: { id: true, name: true, grade: true } },
      approvedBy: { select: { name: true } },
      feedbacks: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!report) notFound();

  const unreadCount = report.feedbacks.filter((f) => !f.readAt).length;

  // 2) 자동 읽음 처리 (다음 방문부터 카운트 0). 현재 페이지 UI 에는 영향 X
  if (unreadCount > 0) {
    await prisma.onlineParentFeedback.updateMany({
      where: { reportId: id, readAt: null },
      data: { readAt: new Date() },
    });
  }

  const content = (report.content as unknown as { markdown?: string }) ?? {};
  const markdown = content.markdown ?? "";

  const hdrs = await headers();
  const host = hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const publicUrl = `${proto}://${host}/r/online/${report.token}`;

  const periodLabel = `${report.periodStart.toLocaleDateString("ko-KR")} ~ ${report.periodEnd.toLocaleDateString("ko-KR")}`;

  const isMonthly = report.type === "MONTHLY";
  const typeLabel = isMonthly ? "월간 보고서" : "주간 보고서";

  return (
    <div>
      <PageHeader
        back={
          isMonthly
            ? { href: "/online/reports/monthly", label: "월간 보고서" }
            : { href: "/online/reports", label: "주간 보고서" }
        }
        title={`${report.student.name} ${typeLabel}`}
        meta={
          <>
            <ReportStatusBadge status={report.status} />
            {report.feedbacks.length > 0 && (
              <a
                href="#parent-feedback"
                title="학부모 피드백 섹션으로 이동"
                className="inline-flex h-x6 items-center gap-x1 rounded-full bg-bg-neutral-weak px-x2 t3-medium text-fg-neutral-muted transition-colors hover:bg-bg-neutral-weak-pressed"
              >
                <MessageCircle className="size-3.5" aria-hidden />
                피드백 <span className="tabular-nums">{report.feedbacks.length}</span>건
              </a>
            )}
          </>
        }
        description={
          <span className="tabular-nums">
            {report.student.grade} · {periodLabel}
            {report.approvedBy && ` · 승인 ${report.approvedBy.name}`}
            {report.sentAt && ` · 발송 ${report.sentAt.toLocaleDateString("ko-KR")}`}
            {report.status === "SENT" && ` · 열람 ${report.viewCount}회`}
          </span>
        }
      />

      <div className="flex flex-col gap-x6">
        {/* 신규 피드백 도착 — 즉시 강조 배너 (이번 진입 시 미확인이었던 건 수) */}
        {unreadCount > 0 && (
          <a
            href="#parent-feedback"
            className="flex items-center gap-x3 rounded-r4 bg-bg-warning-weak px-x5 py-x4 transition-colors hover:bg-bg-warning-weak-pressed"
          >
            <MessageCircle className="size-5 shrink-0 text-fg-warning" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="t4-bold text-fg-neutral">
                학부모 피드백 <span className="tabular-nums">{unreadCount}</span>건이 새로 도착했어요
              </p>
              <p className="mt-x0_5 t3-regular text-fg-neutral-muted">
                아래 ‘학부모 피드백’에서 확인해 주세요. 이 화면을 열면 확인 처리돼요.
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-x1 t3-medium text-fg-neutral-muted">
              <ChevronDown className="size-4" aria-hidden />
              아래로
            </span>
          </a>
        )}

        {isMonthly && (
          <MonthlyExamSelector
            reportId={report.id}
            studentId={report.studentId}
            currentSessionId={report.selectedExamSessionId}
          />
        )}

        <ReportEditor
          reportId={report.id}
          initialMarkdown={markdown}
          initialStatus={report.status}
          publicUrl={publicUrl}
          errorMessage={report.errorMessage}
        />

        <Section
          id="parent-feedback"
          title="학부모 피드백"
          count={report.feedbacks.length > 0 ? report.feedbacks.length : undefined}
          description="학부모가 공개 페이지 하단에서 보낸 의견이에요."
          flush
          className="scroll-mt-20"
        >
          {report.feedbacks.length > 0 ? (
            <ul className="border-t border-stroke-neutral-muted">
              {report.feedbacks.map((f) => {
                // 이번 진입에서 미확인이었던 건 (readAt 이 방금 1초 이내에 set)
                const wasUnread = !f.readAt;
                return (
                  <li
                    key={f.id}
                    className={
                      wasUnread
                        ? "border-b border-stroke-neutral-muted bg-bg-warning-weak px-x5 py-x4 last:border-b-0"
                        : "border-b border-stroke-neutral-muted px-x5 py-x4 last:border-b-0"
                    }
                  >
                    <div className="flex flex-wrap items-center gap-x2">
                      <span className="t4-bold text-fg-neutral">
                        {f.name?.trim() || "익명 학부모"}
                      </span>
                      <span className="t3-regular tabular-nums text-fg-neutral-subtle">
                        {f.createdAt.toLocaleString("ko-KR")}
                      </span>
                      {wasUnread && (
                        <StatusBadge tone="warn" className="ml-auto">
                          새 피드백
                        </StatusBadge>
                      )}
                    </div>
                    <p className="mt-x1_5 whitespace-pre-wrap t4-regular text-fg-neutral">
                      {f.content}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              compact
              icon={MessageCircle}
              title="아직 받은 피드백이 없어요"
              description="학부모가 공개 페이지에서 의견을 보내면 여기에 표시돼요."
            />
          )}
        </Section>
      </div>
    </div>
  );
}
