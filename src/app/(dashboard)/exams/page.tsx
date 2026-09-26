import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { ClipboardList, Plus } from "lucide-react";
import { EmptyState, PageHeader, TableCard } from "@/components/backoffice/ui";
import { ExamSessionsTabs } from "@/components/exams/exam-sessions-tabs";
import { requireDashboardSession } from "../_lib/page-guard";

export const dynamic = "force-dynamic";

export default async function ExamsPage() {
  await requireDashboardSession();
  const sessions = await prisma.examSession.findMany({
    orderBy: [{ examDate: "desc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { assignments: true, applications: true } },
      scores: { select: { percentile: true } },
    },
  });

  // 직렬화 가능한 형태로 변환 + 평균 백분위 계산
  const rows = sessions.map((s) => {
    const percentiles = s.scores
      .map((sc) => sc.percentile)
      .filter((p): p is number => typeof p === "number");
    const averagePercentile =
      percentiles.length > 0
        ? percentiles.reduce((a, b) => a + b, 0) / percentiles.length
        : null;
    return {
      id: s.id,
      title: s.title,
      examDate: s.examDate.toISOString(),
      examType: s.examType,
      room: s.room,
      subjects: s.subjects,
      assignmentsCount: s._count.assignments,
      applicationOpen: s.applicationOpen,
      applicationsCount: s._count.applications,
      averagePercentile,
    };
  });

  return (
    <div>
      <PageHeader
        title="시험 관리"
        description={`시험 세션 ${sessions.length}개 · 세션을 눌러 좌석을 배치하거나 성적을 입력하세요`}
        actions={
          <Button asChild>
            <Link href="/exams/new">
              <Plus />
              시험 세션 생성
            </Link>
          </Button>
        }
      />

      {sessions.length === 0 ? (
        <TableCard>
          <EmptyState
            icon={ClipboardList}
            title="아직 만든 시험 세션이 없어요"
            description="시험 세션을 만들면 응시자 좌석 배치와 성적 일괄 입력을 할 수 있어요."
            action={
              <Button asChild>
                <Link href="/exams/new">
                  <Plus />
                  시험 세션 생성
                </Link>
              </Button>
            }
          />
        </TableCard>
      ) : (
        <ExamSessionsTabs sessions={rows} />
      )}
    </div>
  );
}
