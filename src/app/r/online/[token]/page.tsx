import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
import { ParentFeedbackForm } from "@/components/online/parent-feedback-form";
import { ReportViewBeacon } from "@/components/online/report-view-beacon";

// 학부모 공개 페이지. 무인증, 토큰만으로 접근.
// 기존 /r/[token] 은 멘토링 회차 리포트. 이 경로는 온라인 주간/월간 전용으로 완전 분리.
export default async function OnlineParentReportPublicPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const report = await prisma.onlineParentReport.findUnique({
    where: { token },
    include: {
      student: { select: { name: true, grade: true } },
    },
  });
  if (!report) notFound();
  if (report.status !== "SENT") notFound(); // 승인 전/미발송은 열람 불가

  // 열람 트래킹은 클라이언트 비콘에 위임 (Server Component 는 cookie 쓰기 불가)

  const content = (report.content as unknown as { markdown?: string }) ?? {};
  const markdown = content.markdown ?? "";
  const typeLabel =
    report.type === "WEEKLY" ? "주간" : report.type === "MONTHLY" ? "월간" : "수시";

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-panel">
        <div className="mx-auto max-w-[720px] px-4 py-4">
          <div className="text-[11px] font-medium text-ink-4 uppercase tracking-wide">
            학부모 {typeLabel} 보고서
          </div>
          <h1 className="mt-1 text-[18px] font-semibold text-ink">
            {report.student.name} 학생 ({report.student.grade})
          </h1>
          <p className="mt-1 text-[12px] text-ink-4 tabular-nums">
            {report.periodStart.toLocaleDateString("ko-KR")} ~{" "}
            {report.periodEnd.toLocaleDateString("ko-KR")}
            {report.sentAt && (
              <>
                {" · 발송 "}
                {report.sentAt.toLocaleDateString("ko-KR")}
              </>
            )}
          </p>
        </div>
      </header>

      <ReportViewBeacon token={token} />

      <main className="mx-auto max-w-[720px] px-4 py-5 space-y-5">
        <div className="rounded-[12px] border border-line bg-panel p-5">
          {markdown ? (
            <MarkdownViewer source={markdown} />
          ) : (
            <p className="text-[13px] text-ink-5">내용이 비어 있습니다.</p>
          )}
        </div>

        <ParentFeedbackForm token={token} />

        <footer className="text-center text-[11px] text-ink-5">
          이 링크는 담당 원장님에 의해 공개되었습니다. 외부에 재공유하지 말아 주세요.
        </footer>
      </main>
    </div>
  );
}
