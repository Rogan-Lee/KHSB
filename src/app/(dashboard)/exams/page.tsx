import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { PageIntro } from "@/components/ui/page-intro";
import { ExamSessionsTabs } from "@/components/exams/exam-sessions-tabs";

export const dynamic = "force-dynamic";

export default async function ExamsPage() {
  const sessions = await prisma.examSession.findMany({
    orderBy: [{ examDate: "desc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { assignments: true } },
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
      averagePercentile,
    };
  });

  return (
    <div className="space-y-4">
      <PageIntro
        tag="EXAMS · 01"
        title="시험 관리"
        description="H룸 기반 시험 좌석 랜덤 배치 및 응시자 성적 일괄 입력"
        accent="text-info"
      />

      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium">시험 세션 목록</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                총 {sessions.length}개 · 세션을 클릭해 좌석을 배치하거나 성적을 입력하세요
              </p>
            </div>
            <Link href="/exams/new">
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                시험 세션 생성
              </Button>
            </Link>
          </div>

          {sessions.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              아직 생성된 시험 세션이 없습니다.
            </div>
          ) : (
            <ExamSessionsTabs sessions={rows} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
