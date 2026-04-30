import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { ChevronLeft, MessageCircle, ChevronDown } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isFullAccess } from "@/lib/roles";
import { ReportEditor } from "@/components/online/report-editor";

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

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/online/reports"
          className="inline-flex items-center gap-1 text-[12px] text-ink-4 hover:text-ink"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          보고서 목록
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-semibold text-ink tracking-[-0.015em] inline-flex items-center gap-2">
          {report.student.name} — 주간 보고서
          {report.feedbacks.length > 0 && (
            <a
              href="#parent-feedback"
              className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-0.5 text-[12px] font-semibold hover:bg-amber-200"
              title="학부모 피드백 섹션으로 이동"
            >
              <MessageCircle className="h-3 w-3" />
              피드백 {report.feedbacks.length}건
            </a>
          )}
        </h1>
        <p className="mt-1 text-[13px] text-ink-4">
          {report.student.grade} · {periodLabel}
          {report.approvedBy && ` · 승인: ${report.approvedBy.name}`}
          {report.sentAt && ` · 발송: ${report.sentAt.toLocaleDateString("ko-KR")}`}
          {report.status === "SENT" && ` · 열람 ${report.viewCount}회`}
        </p>
      </header>

      {/* 신규 피드백 도착 — 즉시 강조 배너 (이번 진입 시 미확인이었던 건 수) */}
      {unreadCount > 0 && (
        <a
          href="#parent-feedback"
          className="block rounded-[12px] border-2 border-amber-300 bg-amber-50 p-4 hover:border-amber-400 transition-colors"
        >
          <div className="flex items-center gap-3">
            <MessageCircle className="h-5 w-5 text-amber-700 shrink-0" />
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-amber-900">
                학부모 피드백 {unreadCount}건이 새로 도착했어요
              </p>
              <p className="text-[11.5px] text-amber-800 mt-0.5">
                아래 "학부모 피드백" 섹션에서 내용을 확인하세요. 페이지를 닫으면 자동으로 확인 처리됩니다.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-200 text-amber-900 px-2.5 py-1 text-[11px] font-semibold">
              <ChevronDown className="h-3 w-3" />
              아래로 이동
            </span>
          </div>
        </a>
      )}

      <ReportEditor
        reportId={report.id}
        initialMarkdown={markdown}
        initialStatus={report.status}
        publicUrl={publicUrl}
        errorMessage={report.errorMessage}
      />

      {report.feedbacks.length > 0 ? (
        <section
          id="parent-feedback"
          className="rounded-[12px] border-2 border-ink/10 bg-panel p-4 scroll-mt-4"
        >
          <h2 className="text-[14px] font-semibold text-ink mb-3 inline-flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-ink-3" />
            학부모 피드백 ({report.feedbacks.length})
          </h2>
          <ul className="space-y-2">
            {report.feedbacks.map((f) => {
              // 이번 진입에서 미확인이었던 건 (readAt 이 방금 1초 이내에 set)
              const wasUnread = !f.readAt;
              return (
                <li
                  key={f.id}
                  className={`rounded-[10px] border p-3 ${wasUnread ? "border-amber-300 bg-amber-50" : "border-line bg-canvas-2/30"}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[12.5px] font-semibold text-ink">
                      {f.name?.trim() || "익명 학부모"}
                    </span>
                    <span className="text-[11px] text-ink-5">
                      {f.createdAt.toLocaleString("ko-KR")}
                    </span>
                    {wasUnread && (
                      <span className="ml-auto inline-flex items-center rounded-full bg-amber-200 text-amber-900 px-2 py-0.5 text-[10.5px] font-semibold">
                        NEW
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] text-ink whitespace-pre-wrap leading-relaxed">
                    {f.content}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <section
          id="parent-feedback"
          className="rounded-[12px] border border-dashed border-line bg-canvas-2/40 p-6 text-center"
        >
          <MessageCircle className="h-5 w-5 text-ink-5 mx-auto mb-2" />
          <p className="text-[12.5px] text-ink-5">
            아직 받은 학부모 피드백이 없습니다.
          </p>
          <p className="text-[11px] text-ink-5 mt-0.5">
            학부모가 공개 페이지 하단에서 의견을 보내면 여기에 표시됩니다.
          </p>
        </section>
      )}
    </div>
  );
}
