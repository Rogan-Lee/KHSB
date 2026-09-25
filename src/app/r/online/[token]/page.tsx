import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { ReportHero, ReportShell } from "@/components/parent-report/report-shell";
import { Prose } from "@/components/portal/prose";
import { EmptyState, Section } from "@/components/portal/ui";
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
    <ReportShell
      label={`${typeLabel} 보고서`}
      footer="담당 원장님이 공개한 보고서예요. 링크를 다른 사람에게 전달하지 말아 주세요."
    >
      <ReportViewBeacon token={token} />

      <ReportHero
        eyebrow={`학부모 ${typeLabel} 보고서`}
        title={`${report.student.name} 학생`}
        meta={[
          report.student.grade,
          <span key="period" className="tabular-nums">
            {formatMonthDay(report.periodStart)} ~ {formatMonthDay(report.periodEnd)}
          </span>,
          report.sentAt && (
            <span key="sent" className="tabular-nums">
              발송 {formatMonthDay(report.sentAt)}
            </span>
          ),
        ]}
      />

      <Section>
        {markdown.trim() ? (
          <Prose source={markdown} />
        ) : (
          <EmptyState icon={FileText} title="아직 작성된 내용이 없어요" className="py-x8" />
        )}
      </Section>

      <ParentFeedbackForm token={token} />
    </ReportShell>
  );
}

const MONTH_DAY = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
});

/** "4월 13일" (KST) */
function formatMonthDay(date: Date): string {
  return MONTH_DAY.format(date);
}

