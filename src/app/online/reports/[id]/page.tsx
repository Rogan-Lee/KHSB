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

  const report = await prisma.onlineParentReport.findUnique({
    where: { id },
    include: {
      student: { select: { id: true, name: true, grade: true } },
      approvedBy: { select: { name: true } },
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
    </div>
  );
}
