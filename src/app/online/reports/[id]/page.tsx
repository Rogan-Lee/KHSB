import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { ChevronLeft } from "lucide-react";
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

  // 진입 시 미확인 피드백을 일괄 읽음 처리 (UI 에는 회색으로 표시됨)
  await prisma.onlineParentFeedback.updateMany({
    where: { reportId: id, readAt: null },
    data: { readAt: new Date() },
  });

  const report = await prisma.onlineParentReport.findUnique({
    where: { id },
    include: {
      student: { select: { id: true, name: true, grade: true } },
      approvedBy: { select: { name: true } },
      feedbacks: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!report) notFound();

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
        <h1 className="text-2xl font-semibold text-ink tracking-[-0.015em]">
          {report.student.name} — 주간 보고서
        </h1>
        <p className="mt-1 text-[13px] text-ink-4">
          {report.student.grade} · {periodLabel}
          {report.approvedBy && ` · 승인: ${report.approvedBy.name}`}
          {report.sentAt && ` · 발송: ${report.sentAt.toLocaleDateString("ko-KR")}`}
          {report.status === "SENT" && ` · 열람 ${report.viewCount}회`}
        </p>
      </header>

      <ReportEditor
        reportId={report.id}
        initialMarkdown={markdown}
        initialStatus={report.status}
        publicUrl={publicUrl}
        errorMessage={report.errorMessage}
      />

      {report.feedbacks.length > 0 && (
        <section className="rounded-[12px] border border-line bg-panel p-4">
          <h2 className="text-[13px] font-semibold text-ink mb-3">
            학부모 피드백 ({report.feedbacks.length})
          </h2>
          <ul className="space-y-2">
            {report.feedbacks.map((f) => (
              <li
                key={f.id}
                className={`rounded-[10px] border p-3 ${f.readAt ? "border-line bg-canvas-2/30" : "border-amber-200 bg-amber-50"}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[12px] font-semibold text-ink">
                    {f.name?.trim() || "익명 학부모"}
                  </span>
                  <span className="text-[11px] text-ink-5">
                    {f.createdAt.toLocaleString("ko-KR")}
                  </span>
                  {!f.readAt && (
                    <span className="ml-auto inline-flex items-center rounded-full bg-amber-200 text-amber-900 px-2 py-0.5 text-[10.5px] font-medium">
                      미확인
                    </span>
                  )}
                </div>
                <p className="text-[12.5px] text-ink whitespace-pre-wrap leading-relaxed">
                  {f.content}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
