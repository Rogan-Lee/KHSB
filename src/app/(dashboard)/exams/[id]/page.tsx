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

  // 공식 모의·내신은 학생들이 학교/시험장에서 응시하므로 자습실 좌석 배정이 의미 없음.
  // PRIVATE_MOCK 만 좌석 배정 흐름 유지.
  const isExternalExam =
    session.examType === "OFFICIAL_MOCK" || session.examType === "SCHOOL_EXAM";

  const [students, allAssignedSeatOwners] = await Promise.all([
    prisma.student.findMany({
      where: offlineStudentWhere({ status: "ACTIVE" }),
      select: { id: true, name: true, grade: true, seat: true, school: true },
      orderBy: [{ grade: "asc" }, { seat: "asc" }, { name: "asc" }],
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

  // 외부 시험: 전체 ACTIVE 오프라인 학생을 응시 후보로 노출.
  const externalParticipants = students.map((s) => ({
    studentId: s.id,
    name: s.name,
    grade: s.grade,
    seatNumber: null as number | null,
  }));

  // 자습실 시험(PRIVATE_MOCK): 좌석 배정된 학생만 응시자.
  const seatedParticipants = session.assignments
    .slice()
    .sort((a, b) => a.seatNumber - b.seatNumber)
    .map((a) => ({
      studentId: a.studentId,
      name: a.student.name,
      grade: a.student.grade,
      seatNumber: a.seatNumber as number | null,
    }));

  const existingScores = session.scores.map((sc) => ({
    studentId: sc.studentId,
    subject: sc.subject,
    rawScore: sc.rawScore,
    grade: sc.grade,
    percentile: sc.percentile,
    notes: sc.notes,
  }));

  const headerDescription = isExternalExam
    ? `${EXAM_TYPE_LABELS[session.examType]} · 과목: ${session.subjects.join(", ")}`
    : `${EXAM_TYPE_LABELS[session.examType]} · ${session.room}룸 · 과목: ${session.subjects.join(", ")}`;

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
        description={headerDescription}
        accent="text-info"
      />

      {isExternalExam ? (
        // 외부 시험: 좌석 배정 없이 성적 입력만.
        <Card>
          <CardContent className="pt-4">
            <div className="mb-3 text-xs text-muted-foreground">
              외부 시험({EXAM_TYPE_LABELS[session.examType]})은 자습실 좌석 배정이 필요 없습니다.
              아래 전체 학생 목록에서 응시한 학생만 점수를 입력하면 됩니다 (빈 값은 저장되지 않음).
            </div>
            {externalParticipants.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                ACTIVE 상태의 오프라인 학생이 없습니다.
              </p>
            ) : (
              <ExamScoreBulkEditor
                sessionId={session.id}
                subjects={session.subjects}
                participants={externalParticipants}
                existing={existingScores}
              />
            )}
          </CardContent>
        </Card>
      ) : (
        // PRIVATE_MOCK (자습실 시험): 기존 2탭 흐름 유지.
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
                {seatedParticipants.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    먼저 &quot;좌석 배치&quot; 탭에서 응시자를 선택하세요.
                  </p>
                ) : (
                  <ExamScoreBulkEditor
                    sessionId={session.id}
                    subjects={session.subjects}
                    participants={seatedParticipants}
                    existing={existingScores}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <div className="flex justify-end">
        <Link href={`/exams/${id}/edit`}>
          <Button variant="outline" size="sm">세션 정보 수정</Button>
        </Link>
      </div>
    </div>
  );
}
