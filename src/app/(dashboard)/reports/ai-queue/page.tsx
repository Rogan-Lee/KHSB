import { redirect } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { auth } from "@/lib/auth";
import { isFullAccess } from "@/lib/roles";
import { getAiJobQueueOverview } from "@/lib/report-ai-queue";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader, StatCard, StatCards, StatusBadge, TableCard } from "@/components/backoffice/ui";

// AI 텍스트 생성 예약 대기열 — QUEUED 상태 ReportAiJob 목록.
// 야간 Claude 루틴(/api/cron/report-ai-queue)이 오래 대기한 것부터 생성한다.
export const dynamic = "force-dynamic";

export default async function ReportAiQueuePage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  if (!isFullAccess(session.user.role)) redirect("/");

  const rows = await getAiJobQueueOverview();
  const monthly = rows.filter((r) => r.type === "MONTHLY_SUMMARY").length;
  const mentoring = rows.filter((r) => r.type === "MENTORING_COMMENT").length;

  return (
    <div className="max-w-4xl">
      <PageHeader
        back={{ href: "/reports/monthly", label: "월간 리포트" }}
        title="AI 생성 예약 대기열"
        description="야간 Claude 루틴이 오래 기다린 것부터 차례로 만들어요. 생성되면 해당 리포트의 종합의견·코멘트에 자동으로 들어가요."
      />

      <div className="flex flex-col gap-x6">
        <StatCards cols={3}>
          <StatCard label="대기 중" value={rows.length} unit="건" />
          <StatCard label="월간 종합의견" value={monthly} unit="건" />
          <StatCard label="멘토링 코멘트" value={mentoring} unit="건" />
        </StatCards>

        <TableCard>
          {rows.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="대기 중인 예약이 없어요"
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
