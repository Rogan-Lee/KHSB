import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isFullAccess } from "@/lib/roles";
import { mondayOfKST, shiftWeek } from "@/lib/online/week";
import {
  OnlineReportsPanel,
  type OnlineReportRow,
} from "@/components/online/online-reports-panel";

export default async function ReportsDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const user = await getUser();
  if (!isFullAccess(user?.role)) redirect("/online");

  const { week } = await searchParams;
  const weekStart = week ?? shiftWeek(mondayOfKST(), -1); // 기본: 지난 주
  const weekStartDate = new Date(weekStart + "T00:00:00.000Z");

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
      where: { type: "WEEKLY", periodStart: weekStartDate },
      include: {
        approvedBy: { select: { name: true } },
      },
    }),
  ]);

  const reportByStudent = new Map(existingReports.map((r) => [r.studentId, r]));

  const rows: OnlineReportRow[] = students.map((s) => {
    const r = reportByStudent.get(s.id);
    return {
      studentId: s.id,
      studentName: s.name,
      grade: s.grade,
      assignedMentorName: s.assignedMentor?.name ?? null,
      report: r
        ? {
            id: r.id,
            status: r.status,
            token: r.token,
            markdown:
              ((r.content as unknown as { markdown?: string })?.markdown) ?? "",
            updatedAt: r.updatedAt.toISOString(),
            approvedByName: r.approvedBy?.name ?? null,
            approvedAt: r.approvedAt?.toISOString() ?? null,
            sentAt: r.sentAt?.toISOString() ?? null,
            viewCount: r.viewCount,
            sentChannels: r.sentChannels,
            errorMessage: r.errorMessage,
          }
        : null,
    };
  });

  const hdrs = await headers();
  const host = hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-ink tracking-[-0.015em]">
          학부모 주간 보고서
        </h1>
        <p className="mt-1 text-[13px] text-ink-4">
          AI 초안은 매주 일요일 10시 자동 생성. 좌측에서 학생 선택 → 우측에서 편집·승인·발송.
        </p>
      </header>

      <OnlineReportsPanel rows={rows} weekStart={weekStart} origin={origin} />
    </div>
  );
}
