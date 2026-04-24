import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageIntro } from "@/components/ui/page-intro";
import { ChevronLeft } from "lucide-react";
import { ExamSeatManager } from "@/components/exams/exam-seat-manager";
import { ExamScoreBulkEditor } from "@/components/exams/exam-score-bulk-editor";
import { EXAM_TYPE_LABELS } from "@/components/exams/exam-type-label";
import { H_ROOM_SEATS } from "@/lib/exam-seats";
import { offlineStudentWhere } from "@/lib/student-filters";

export default async function ExamSessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await prisma.examSession.findUnique({
    where: { id },
    include: {
      assignments: {
        include: { student: { select: { id: true, name: true, grade: true, seat: true, school: true } } },
        orderBy: { seatNumber: "asc" },
      },
      scores: true,
    },
  });
  if (!session) notFound();

  const [students, allAssignedSeatOwners] = await Promise.all([
    prisma.student.findMany({
      where: offlineStudentWhere({ status: "ACTIVE" }),
      select: { id: true, name: true, grade: true, seat: true, school: true },
      orderBy: [{ grade: "asc" }, { name: "asc" }],
    }),
    prisma.student.findMany({
      where: offlineStudentWhere({ status: "ACTIVE", seat: { not: null } }),
      select: { id: true, name: true, seat: true },
    }),
  ]);

  // H룸 좌석 → 원래 주인 맵
  const seatOwnerMap: Record<number, { id: string; name: string }> = {};
  for (const s of allAssignedSeatOwners) {
    const n = Number(s.seat);
    if (!Number.isNaN(n) && H_ROOM_SEATS.includes(n)) {
      seatOwnerMap[n] = { id: s.id, name: s.name };
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/exams" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ChevronLeft className="h-3 w-3" />
          시험 세션 목록
        </Link>
      </div>
      <PageIntro
        tag={`EXAMS · ${session.examDate.toISOString().slice(0, 10)}`}
        title={session.title}
        description={`${EXAM_TYPE_LABELS[session.examType]} · ${session.room}룸 · 과목: ${session.subjects.join(", ")}`}
        accent="text-info"
      />

      <Tabs defaultValue="seats">
        <TabsList>
          <TabsTrigger value="seats">좌석 배치 ({session.assignments.length}명)</TabsTrigger>
          <TabsTrigger value="scores">성적 일괄 입력</TabsTrigger>
        </TabsList>

        <TabsContent value="seats" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              <ExamSeatManager
                sessionId={session.id}
                assignments={session.assignments.map((a) => ({
                  id: a.id,
                  seatNumber: a.seatNumber,
                  studentId: a.studentId,
                  studentName: a.student.name,
                  studentGrade: a.student.grade,
                }))}
                students={students.map((s) => ({
                  id: s.id,
                  name: s.name,
                  grade: s.grade,
                  seat: s.seat,
                  school: s.school,
                }))}
                seatOwnerMap={seatOwnerMap}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scores" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              {session.assignments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  먼저 "좌석 배치" 탭에서 응시자를 선택하세요.
                </p>
              ) : (
                <ExamScoreBulkEditor
                  sessionId={session.id}
                  subjects={session.subjects}
                  participants={session.assignments
                    .slice()
                    .sort((a, b) => a.seatNumber - b.seatNumber)
                    .map((a) => ({
                      studentId: a.studentId,
                      name: a.student.name,
                      grade: a.student.grade,
                      seatNumber: a.seatNumber,
                    }))}
                  existing={session.scores.map((sc) => ({
                    studentId: sc.studentId,
                    subject: sc.subject,
                    rawScore: sc.rawScore,
                    grade: sc.grade,
                    percentile: sc.percentile,
                    notes: sc.notes,
                  }))}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Link href={`/exams/${id}/edit`}>
          <Button variant="outline" size="sm">세션 정보 수정</Button>
        </Link>
      </div>
    </div>
  );
}
