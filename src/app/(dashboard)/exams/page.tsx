import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus } from "lucide-react";
import { PageIntro } from "@/components/ui/page-intro";
import { ExamSessionRowActions } from "@/components/exams/exam-session-row-actions";
import { EXAM_TYPE_LABELS } from "@/components/exams/exam-type-label";

export const dynamic = "force-dynamic";

export default async function ExamsPage() {
  const sessions = await prisma.examSession.findMany({
    orderBy: [{ examDate: "desc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { assignments: true } },
    },
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>시험일</TableHead>
                  <TableHead>시험명</TableHead>
                  <TableHead>종류</TableHead>
                  <TableHead>룸</TableHead>
                  <TableHead>응시자</TableHead>
                  <TableHead>과목</TableHead>
                  <TableHead className="w-20 text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs">
                      {s.examDate.toISOString().slice(0, 10)}
                    </TableCell>
                    <TableCell>
                      <Link href={`/exams/${s.id}`} className="font-medium hover:underline">
                        {s.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs">{EXAM_TYPE_LABELS[s.examType]}</TableCell>
                    <TableCell className="text-xs">{s.room}룸</TableCell>
                    <TableCell className="text-xs">{s._count.assignments}명</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.subjects.join(", ")}
                    </TableCell>
                    <TableCell className="text-right">
                      <ExamSessionRowActions sessionId={s.id} title={s.title} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
