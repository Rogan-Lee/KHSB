import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { CalendarClock, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Section, StatCard, StatCards } from "@/components/backoffice/ui";
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

  // 순찰 특이사항 사유 — 생성된 리포트 학생들 대상으로 한 번에 조회 후 학생별 그룹핑
  const reportStudentIds = reports.map((r) => r.studentId);
  const patrolStart = new Date(year, month - 1, 1);
  const patrolEnd = new Date(year, month, 0, 23, 59, 59);
  const patrolNoteRecords = reportStudentIds.length
    ? await prisma.patrolRecord.findMany({
        where: {
          studentId: { in: reportStudentIds },
          status: "NOTE",
          note: { not: null },
          round: { startedAt: { gte: patrolStart, lte: patrolEnd } },
        },
        orderBy: { checkedAt: "asc" },
        select: { studentId: true, note: true, checkedAt: true },
      })
    : [];
  const patrolNotesByStudent = new Map<string, { date: string; note: string }[]>();
  for (const r of patrolNoteRecords) {
    if (!r.note || !r.note.trim()) continue;
    const [, mm, dd] = new Date(r.checkedAt)
      .toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
      .split("-");
    const list = patrolNotesByStudent.get(r.studentId) ?? [];
    list.push({ date: `${Number(mm)}/${Number(dd)}`, note: r.note.trim() });
    patrolNotesByStudent.set(r.studentId, list);
  }
  const reportsWithNotes = reports.map((r) => ({
    ...r,
    patrolNotes: patrolNotesByStudent.get(r.studentId) ?? [],
  }));

  const sentCount = reports.filter((r) => r.sentAt).length;
  const reportStudentIdSet = new Set(reportStudentIds);
  const notCreatedCount = students.filter((s) => !reportStudentIdSet.has(s.id)).length;

  return (
    <div>
      <PageHeader
        title="월간 학부모 리포트"
        description="공통 내용을 등록하고, 학생별 리포트를 만들어 학부모에게 보내요"
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/reports/ai-queue">
                <CalendarClock />
                AI 예약 대기열
              </Link>
            </Button>
            <MonthSelector year={year} month={month} />
          </>
        }
      />

      <div className="flex flex-col gap-x8">
        <StatCards cols={3}>
          <StatCard label={`${month}월 대상 원생`} value={students.length} unit="명" />
          <StatCard
            label="리포트 생성"
            value={reports.length}
            unit="건"
            sub={students.length > 0 ? `미생성 ${notCreatedCount}명` : undefined}
          />
          <StatCard
            label="발송 완료"
            value={sentCount}
            unit="건"
            tone={reports.length > 0 && sentCount === reports.length ? "ok" : "gray"}
            sub={reports.length > 0 ? `미발송 ${reports.length - sentCount}건` : undefined}
          />
        </StatCards>

        {/* STEP 1: 공통 내용 등록 (모든 학부모 페이지에 공통 표시) */}
        <details className="group" open>
          <summary className="flex cursor-pointer list-none items-start justify-between gap-x3 rounded-r2 pb-x4 [&::-webkit-details-marker]:hidden">
            <div className="min-w-0">
              <h2 className="t6-bold text-fg-neutral">공통 내용</h2>
              <p className="mt-x0_5 t4-regular text-fg-neutral-subtle">
                입시 정보 · 시상 · 운영 공지 · 권장 학습 — 모든 학부모 페이지에 함께 보여요
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-x1 rounded-r2 px-x2 py-x1 t4-medium text-fg-neutral-subtle transition-colors hover:bg-bg-transparent-pressed hover:text-fg-neutral">
              <span className="group-open:hidden">펼치기</span>
              <span className="hidden group-open:inline">접기</span>
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
            </span>
          </summary>
          <div className="grid grid-cols-1 gap-x4 lg:grid-cols-2">
            <Section title="익월 입시 정보">
              <MonthlyAdmissionInfoEditor year={year} month={month} initial={admissionInfo} />
            </Section>

            <Section title="이달의 시상" count={awards.length}>
              <MonthlyAwardsManager year={year} month={month} awards={awards} students={students} />
            </Section>

            <Section title="운영 공지" description="운영 일정 등">
              <MonthlyNoticeEditor
                page="monthly_notice"
                label="운영 공지 (운영 일정 등)"
                initial={operationsNotice}
              />
            </Section>

            <Section title="이달의 권장 과목 · 인강 · 교재">
              <MonthlyNoticeEditor
                page="monthly_recommendation"
                label="권장 학습 리소스"
                initial={recommendation}
              />
            </Section>
          </div>
        </details>

        {/* STEP 2~5: 학생별 리포트 (다중선택 → 일괄생성 → 수정 → URL → 발송) */}
        <Section
          variant="plain"
          title="학생별 리포트"
          description="학생을 골라 한 번에 만들고, 왼쪽에서 학생을 누르면 오른쪽에서 바로 고치고 보낼 수 있어요"
        >
          <MonthlyReportPanel year={year} month={month} students={students} reports={reportsWithNotes} />
        </Section>
      </div>
    </div>
  );
}

function MonthSelector({ year, month }: { year: number; month: number }) {
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return (
    <div className="flex items-center gap-x0_5 rounded-r2 bg-bg-neutral-weak p-x0_5">
      <Button variant="ghost" size="icon" className="size-x9" asChild>
        <a href={`/reports/monthly?year=${prev.year}&month=${prev.month}`} aria-label="이전 달">
          <ChevronLeft />
        </a>
      </Button>
      <span className="min-w-24 px-x1 text-center t4-bold tabular-nums text-fg-neutral">
        {year}년 {month}월
      </span>
      <Button variant="ghost" size="icon" className="size-x9" asChild>
        <a href={`/reports/monthly?year=${next.year}&month=${next.month}`} aria-label="다음 달">
          <ChevronRight />
        </a>
      </Button>
    </div>
  );
}
