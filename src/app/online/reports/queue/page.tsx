import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { getUser } from "@/lib/auth";
import { isFullAccess } from "@/lib/roles";
import { getQueueOverview } from "@/lib/online/report-queue";
import { ReportsTypeNav } from "@/components/online/reports-type-nav";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  PageHeader,
  StatCard,
  StatCards,
  StatusBadge,
  TableCard,
  type Tone,
} from "@/components/backoffice/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// 예약 생성 대기열 — QUEUED 상태 보고서 목록.
// 야간 Claude 루틴(5시간 간격, 회당 30건)이 오래 대기한 것부터 생성한다.
export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  WEEKLY: "주간",
  MONTHLY: "월간",
  ADHOC: "수시",
};

const TYPE_TONE: Record<string, Tone> = {
  WEEKLY: "gray",
  MONTHLY: "info",
  ADHOC: "gray",
};

export default async function ReportQueuePage() {
  const user = await getUser();
  if (!isFullAccess(user?.role)) redirect("/online");

  const rows = await getQueueOverview();
  const weekly = rows.filter((r) => r.type === "WEEKLY").length;
  const monthly = rows.filter((r) => r.type === "MONTHLY").length;

  return (
    <div>
      <PageHeader
        title="학부모 보고서"
        description="야간 Claude 루틴이 5시간마다 최대 30건씩, 오래 기다린 것부터 초안을 만들어요. 만들어지면 ‘초안’ 상태가 되어 검토·승인·발송할 수 있어요."
      />
      <ReportsTypeNav current="QUEUE" />

      <div className="flex flex-col gap-x5">
        <StatCards cols={3}>
          <StatCard label="대기 중" value={rows.length} unit="건" tone={rows.length > 0 ? "brand" : "gray"} />
          <StatCard label="주간" value={weekly} unit="건" />
          <StatCard label="월간" value={monthly} unit="건" />
        </StatCards>

        <TableCard>
          {rows.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="대기 중인 예약이 없어요"
              description="보고서 화면에서 예약 등록하면 여기에 쌓이고, 야간에 순서대로 만들어져요."
              action={
                <Button asChild variant="secondary">
                  <Link href="/online/reports/monthly">월간 보고서로 이동</Link>
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>학생</TableHead>
                  <TableHead>학년</TableHead>
                  <TableHead>종류</TableHead>
                  <TableHead>기간</TableHead>
                  <TableHead className="text-right">등록 시각</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.reportId}>
                    <TableCell className="whitespace-nowrap t4-medium">{r.studentName}</TableCell>
                    <TableCell className="whitespace-nowrap text-fg-neutral-muted">
                      {r.studentGrade ?? "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={TYPE_TONE[r.type] ?? "gray"}>
                        {TYPE_LABEL[r.type] ?? r.type}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-fg-neutral-muted">
                      {r.periodStart} ~ {r.periodEnd}
                    </TableCell>
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
