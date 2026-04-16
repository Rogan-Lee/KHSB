import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthlyReportPanel } from "@/components/reports/monthly-report-panel";
import { MonthlyAdmissionInfoEditor } from "@/components/reports/monthly-admission-info-editor";
import { MonthlyAwardsManager } from "@/components/reports/monthly-awards-manager";
import { MonthlyNoticeEditor } from "@/components/reports/monthly-notice-editor";

export default async function MonthlyReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  if (session.user.role !== "DIRECTOR" && session.user.role !== "ADMIN") redirect("/");

  const params = await searchParams;
  const now = new Date();
  const year = Number(params.year) || now.getFullYear();
  const month = Number(params.month) || now.getMonth() + 1;

  const [students, reports, admissionInfo, awards, operationsNotice, recommendation] = await Promise.all([
    prisma.student.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, grade: true },
      orderBy: [{ grade: "asc" }, { name: "asc" }],
    }),
    prisma.monthlyReport.findMany({
      where: { year, month },
      include: { student: { select: { id: true, name: true, grade: true } } },
      orderBy: { student: { name: "asc" } },
    }),
    prisma.monthlyAdmissionInfo.findMany({ where: { year, month } }),
    prisma.monthlyAward.findMany({
      where: { year, month },
      include: { student: { select: { id: true, name: true, grade: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.announcement.findFirst({
      where: { page: "monthly_notice" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.announcement.findFirst({
      where: { page: "monthly_recommendation" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">월간 학부모 리포트</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {year}년 {month}월 — 전체 {students.length}명 · 생성 {reports.length}건 · 발송 {reports.filter((r) => r.sentAt).length}건
          </p>
        </div>
        <MonthSelector year={year} month={month} />
      </div>

      {/* 공통 리소스 (모든 학생에게 공통 적용) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">익월 입시 정보</CardTitle>
          </CardHeader>
          <CardContent>
            <MonthlyAdmissionInfoEditor year={year} month={month} initial={admissionInfo} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">이달의 시상</CardTitle>
          </CardHeader>
          <CardContent>
            <MonthlyAwardsManager year={year} month={month} awards={awards} students={students} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">운영 공지</CardTitle>
          </CardHeader>
          <CardContent>
            <MonthlyNoticeEditor
              page="monthly_notice"
              label="운영 공지 (운영 일정 등)"
              initial={operationsNotice}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">이달의 권장 과목 · 인강 · 교재</CardTitle>
          </CardHeader>
          <CardContent>
            <MonthlyNoticeEditor
              page="monthly_recommendation"
              label="권장 학습 리소스"
              initial={recommendation}
            />
          </CardContent>
        </Card>
      </div>

      {/* 학생별 리포트 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">학생별 리포트</CardTitle>
        </CardHeader>
        <CardContent>
          <MonthlyReportPanel year={year} month={month} students={students} reports={reports} />
        </CardContent>
      </Card>
    </div>
  );
}

function MonthSelector({ year, month }: { year: number; month: number }) {
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return (
    <div className="flex items-center gap-1">
      <a
        href={`/reports/monthly?year=${prev.year}&month=${prev.month}`}
        className="px-3 py-1.5 text-sm rounded-md border hover:bg-accent"
      >
        ‹ 이전
      </a>
      <span className="px-3 py-1.5 text-sm font-medium">
        {year}년 {month}월
      </span>
      <a
        href={`/reports/monthly?year=${next.year}&month=${next.month}`}
        className="px-3 py-1.5 text-sm rounded-md border hover:bg-accent"
      >
        다음 ›
      </a>
    </div>
  );
}
