import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, PageHeader, Section, StatusBadge } from "@/components/backoffice/ui";
import { Pencil, Users } from "lucide-react";
import { ExamSeatManager } from "@/components/exams/exam-seat-manager";
import { ExamScoreBulkEditor } from "@/components/exams/exam-score-bulk-editor";
import { ExamApplicationAdmin } from "@/components/exams/exam-application-admin";
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
      applications: {
        include: { student: { select: { name: true, grade: true } } },
        orderBy: { appliedAt: "asc" },
      },
      scores: true,
    },
  });
  if (!session) notFound();

  const applicationRows = session.applications.map((a) => ({
    id: a.id,
    studentName: a.student.name,
    grade: a.student.grade,
    status: a.status,
    memo: a.memo,
  }));

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

  const examDateLabel = session.examDate.toISOString().slice(0, 10).replaceAll("-", ".");
  const headerDescription = isExternalExam
    ? `${examDateLabel} · 과목 ${session.subjects.join(", ")}`
    : `${examDateLabel} · ${session.room}룸 · 과목 ${session.subjects.join(", ")}`;

  return (
    <div>
      <PageHeader
        back={{ href: "/exams", label: "시험 관리" }}
        title={session.title}
        meta={<StatusBadge tone="info">{EXAM_TYPE_LABELS[session.examType]}</StatusBadge>}
        description={headerDescription}
        actions={
          <Button variant="outline" asChild>
            <Link href={`/exams/${id}/edit`}>
              <Pencil />
              세션 정보 수정
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-x6">
        <ExamApplicationAdmin
          sessionId={session.id}
          applicationOpen={session.applicationOpen}
          applications={applicationRows}
        />

        {isExternalExam ? (
          // 외부 시험: 좌석 배정 없이 성적 입력만.
          <Section
            title="성적 입력"
            description={`${EXAM_TYPE_LABELS[session.examType]}은 자습실 좌석 배정이 필요 없어요. 응시한 학생만 점수를 입력하면 돼요 (빈 값은 저장되지 않아요).`}
          >
            {externalParticipants.length === 0 ? (
              <EmptyState
                compact
                icon={Users}
                title="재원 중인 오프라인 학생이 없어요"
                description="ACTIVE 상태의 오프라인 학생이 있어야 성적을 입력할 수 있어요."
              />
            ) : (
              <ExamScoreBulkEditor
                sessionId={session.id}
                subjects={session.subjects}
                participants={externalParticipants}
                existing={existingScores}
              />
            )}
          </Section>
        ) : (
          // PRIVATE_MOCK (자습실 시험): 기존 2탭 흐름 유지.
          <Tabs defaultValue="seats">
            <TabsList>
              <TabsTrigger value="seats" className="group">
                좌석 배치
                <span className="t4-bold tabular-nums text-fg-placeholder group-data-[state=active]:text-fg-brand">
                  {session.assignments.length}명
                </span>
              </TabsTrigger>
              <TabsTrigger value="scores">성적 일괄 입력</TabsTrigger>
            </TabsList>

            <TabsContent value="seats">
              <Section>
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
              </Section>
            </TabsContent>

            <TabsContent value="scores">
              <Section>
                {seatedParticipants.length === 0 ? (
                  <EmptyState
                    compact
                    icon={Users}
                    title="아직 응시자가 없어요"
                    description={"먼저 \"좌석 배치\" 탭에서 응시자를 선택하세요."}
                  />
                ) : (
                  <ExamScoreBulkEditor
                    sessionId={session.id}
                    subjects={session.subjects}
                    participants={seatedParticipants}
                    existing={existingScores}
                  />
                )}
              </Section>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
