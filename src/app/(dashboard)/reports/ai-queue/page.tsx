import { redirect } from "next/navigation";
import { CalendarClock, ClipboardCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import { isFullAccess } from "@/lib/roles";
import { getAiJobQueueOverview, getAiJobsToReview } from "@/lib/report-ai-queue";
import { AiReviewList } from "@/components/reports/ai-review-list";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader, Section, StatCard, StatCards, StatusBadge, TableCard } from "@/components/backoffice/ui";

// AI 텍스트 생성 예약 — 확인 대기(REVIEW)와 생성 대기(QUEUED).
// 밤에 크론(/api/cron/report-ai-queue)이 오래 대기한 것부터 만들고, 운영진이 확인해야 리포트에 들어간다.
export const dynamic = "force-dynamic";

export default async function ReportAiQueuePage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  if (!isFullAccess(session.user.role)) redirect("/");

  const [rows, reviews] = await Promise.all([getAiJobQueueOverview(), getAiJobsToReview()]);
  const monthly = rows.filter((r) => r.type === "MONTHLY_SUMMARY").length;
  const mentoring = rows.filter((r) => r.type === "MENTORING_COMMENT").length;

  return (
    <div className="max-w-4xl">
      <PageHeader
        back={{ href: "/reports/monthly", label: "월간 리포트" }}
        title="AI 생성 예약"
        description="밤사이 오래 기다린 것부터 차례로 만들어요. 여기서 확인하고 반영해야 학부모님 리포트에 들어가요."
      />

      <div className="flex flex-col gap-x6">
        <StatCards cols={4}>
          <StatCard label="확인 대기" value={reviews.length} unit="건" tone={reviews.length > 0 ? "warn" : "gray"} />
          <StatCard label="생성 대기" value={rows.length} unit="건" />
          <StatCard label="월간 종합의견" value={monthly} unit="건" />
          <StatCard label="멘토링 코멘트" value={mentoring} unit="건" />
        </StatCards>

        <Section title="확인 대기" count={reviews.length} flush className="overflow-hidden">
          {reviews.length === 0 ? (
            <EmptyState icon={ClipboardCheck} title="확인할 결과가 없어요" description="예약한 글이 만들어지면 여기에 나타나요." />
          ) : (
            <AiReviewList rows={reviews} />
          )}
        </Section>

        <TableCard>
          {rows.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="생성을 기다리는 예약이 없어요"
              description="월간 리포트에서 학생을 골라 'AI 종합의견 예약'을 누르면 여기에 쌓여요."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>학생</TableHead>
                  <TableHead>유형</TableHead>
                  <TableHead>대상</TableHead>
                  <TableHead className="text-right">대기 시각</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.jobId}>
                    <TableCell className="t4-medium">{r.studentName}</TableCell>
                    <TableCell>
                      <StatusBadge tone="gray">{r.typeLabel}</StatusBadge>
                    </TableCell>
                    <TableCell className="text-fg-neutral-muted">{r.periodLabel ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right text-fg-neutral-subtle">
                      {new Date(r.queuedAt).toLocaleString("ko-KR")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TableCard>
      </div>
    </div>
  );
}
