export const revalidate = 30;

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { PageHeader, Section } from "@/components/backoffice/ui";
import { AcademicPlanEditor } from "@/components/academic-plans/academic-plan-editor";
import { requireDashboardSession } from "../_lib/page-guard";

export default async function AcademicPlansPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  await requireDashboardSession();
  const params = await searchParams;
  const now = new Date();
  const year = Number(params.year) || now.getFullYear();
  const month = Number(params.month) || now.getMonth() + 1;

  const [students, plans] = await Promise.all([
    prisma.student.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, grade: true },
      orderBy: { name: "asc" },
    }),
    prisma.academicPlan.findMany({
      where: { year, month },
      include: { student: { select: { id: true, name: true, grade: true } } },
    }),
  ]);

  const planMap = Object.fromEntries(plans.map((p) => [p.studentId, p]));
  const writtenCount = students.filter((s) => planMap[s.id]).length;

  // 이전·다음 달 (기존 ?year=&month= 쿼리 그대로 사용)
  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };

  return (
    <>
      <PageHeader
        title="학업 플래닝"
        description={`${year}년 ${month}월 · 원생별 월간 목표와 과목별 실적, 월말 회고를 기록해요.`}
        actions={
          <div className="flex items-center gap-x1">
            <Button variant="outline" size="icon" asChild>
              <Link href={`/academic-plans?year=${prev.y}&month=${prev.m}`} aria-label="이전 달">
                <ChevronLeft aria-hidden />
              </Link>
            </Button>
            <span className="min-w-24 text-center t5-bold tabular-nums text-fg-neutral">
              {year}. {String(month).padStart(2, "0")}
            </span>
            <Button variant="outline" size="icon" asChild>
              <Link href={`/academic-plans?year=${next.y}&month=${next.m}`} aria-label="다음 달">
                <ChevronRight aria-hidden />
              </Link>
            </Button>
          </div>
        }
      />

      <Section
        title="원생별 플랜"
        count={students.length}
        description={`작성 ${writtenCount}명 · 미작성 ${students.length - writtenCount}명`}
        flush
      >
        <AcademicPlanEditor
          students={students}
          planMap={planMap}
          year={year}
          month={month}
        />
      </Section>
    </>
  );
}
