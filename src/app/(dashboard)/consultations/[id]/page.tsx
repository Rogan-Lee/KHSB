import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTimetableEntries, getStudentSchoolEvents } from "@/actions/timetable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DayView } from "@/components/timetable/day-view";
import { TimetableGrid } from "@/components/timetable/timetable-grid";
import { AssignmentPanel } from "@/components/assignments/assignment-panel";
import { CommunicationPanel } from "@/components/communications/communication-panel";
import { ExamScoreChart } from "@/components/students/exam-score-chart";
import { StudentInfoReveal } from "@/components/mentoring/student-info-reveal";
import { ConsultationRecordForm } from "@/components/consultations/consultation-record-form";
import { FollowUpMessagePanel } from "@/components/consultations/followup-message-panel";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

const STATUS_CONFIG = {
  SCHEDULED: { label: "예정", variant: "secondary" as const },
  COMPLETED: { label: "완료", variant: "default" as const },
  CANCELLED: { label: "취소", variant: "destructive" as const },
};

export default async function ConsultationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const { id } = await params;

  const consultation = await prisma.directorConsultation.findUnique({
    where: { id },
    include: {
      student: {
        select: {
          id: true, name: true, grade: true, school: true,
          mentoringNotes: true, studentInfo: true,
          internalScoreRange: true, mockScoreRange: true,
          targetUniversity: true, parentEmail: true,
          selectedSubjects: true,
          admissionType: true, onlineLectures: true,
          communications: { orderBy: { createdAt: "desc" } },
          examScores: { orderBy: { examDate: "desc" } },
          assignments: { orderBy: { createdAt: "desc" } },
        },
      },
    },
  });

  if (!consultation) notFound();

  const s = consultation.student;
  const isProspect = !s;
  const owner = (consultation as Record<string, unknown>).owner as string ?? "DIRECTOR";
  const isHeadTeacher = owner === "HEAD_TEACHER";
  const backHref = isHeadTeacher ? "/consultations?owner=HEAD_TEACHER" : "/consultations";

  let timetableEntries: Awaited<ReturnType<typeof getTimetableEntries>> = [];
  let schoolEvents: Awaited<ReturnType<typeof getStudentSchoolEvents>> = [];
  let previousConsultations: Array<{
    id: string;
    scheduledAt: Date | null;
    actualDate: Date | null;
    agenda: string | null;
    outcome: string | null;
    followUp: string | null;
    notes: string | null;
  }> = [];

  if (s) {
    const evtFrom = new Date(); evtFrom.setMonth(evtFrom.getMonth() - 3);
    const evtTo = new Date(); evtTo.setMonth(evtTo.getMonth() + 3);

    [timetableEntries, schoolEvents] = await Promise.all([
      getTimetableEntries(s.id),
      getStudentSchoolEvents(s.id, evtFrom, evtTo),
    ]);

    // 이전 완료된 면담 기록 (현재 제외, 최근 5건)
    previousConsultations = await prisma.directorConsultation.findMany({
      where: {
        studentId: s.id,
        id: { not: id },
        status: "COMPLETED",
      },
      orderBy: { scheduledAt: "desc" },
      take: 5,
      select: {
        id: true,
        scheduledAt: true,
        actualDate: true,
        agenda: true,
        outcome: true,
        followUp: true,
        notes: true,
      },
    });
  }

  const statusCfg = STATUS_CONFIG[consultation.status] ?? STATUS_CONFIG.SCHEDULED;

  return (
    <div className="space-y-4">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <Link
          href={backHref}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h2 className="text-xl font-bold">{isHeadTeacher ? "책임T 면담" : "원장 면담"}</h2>
        <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
      </div>

      {/* Basic info card */}
      <Card>
        <CardContent className="pt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">원생</p>
            <p className="font-medium">
              {s ? s.name : consultation.prospectName ?? "—"}{" "}
              {(s?.grade || consultation.prospectGrade) && (
                <span className="text-muted-foreground text-xs">({s?.grade ?? consultation.prospectGrade})</span>
              )}
              {isProspect && (
                <Badge variant="outline" className="ml-1.5 text-[10px] bg-amber-50 text-amber-700 border-amber-200">신규 상담</Badge>
              )}
            </p>
          </div>
          {s ? (
            <>
              <div>
                <p className="text-muted-foreground text-xs">학교</p>
                <p className="font-medium">{s.school || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">학부모 이메일</p>
                <p className="text-xs">{s.parentEmail || <span className="text-muted-foreground">미등록</span>}</p>
              </div>
            </>
          ) : (
            <div>
              <p className="text-muted-foreground text-xs">연락처</p>
              <p className="font-medium">{consultation.prospectPhone || "—"}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="record">
        <TabsList>
          <TabsTrigger value="record">면담 기록</TabsTrigger>
          {s && (
            <>
              <TabsTrigger value="timetable">시간표</TabsTrigger>
              <TabsTrigger value="assignments">
                과제
                {s.assignments.filter((a) => !a.isCompleted).length > 0 && (
                  <span className="ml-1.5 bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {s.assignments.filter((a) => !a.isCompleted).length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="communications">
                요청/전달
                {s.communications.filter((c) => !c.isChecked).length > 0 && (
                  <span className="ml-1.5 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {s.communications.filter((c) => !c.isChecked).length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="scores">성적 추이</TabsTrigger>
              <TabsTrigger value="studentinfo">학생 정보</TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="record" className="mt-4 space-y-4">
          {/* AI 팔로업 메시지 */}
          <FollowUpMessagePanel
            consultationId={consultation.id}
            recipientName={
              s ? s.name : (consultation as Record<string, unknown>).prospectName as string ?? "—"
            }
            prospectPhone={
              (consultation as Record<string, unknown>).prospectPhone as string | null
            }
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">면담 내용 기록</CardTitle>
            </CardHeader>
            <CardContent>
              <ConsultationRecordForm
                consultationId={consultation.id}
                scheduledAt={consultation.scheduledAt}
                actualDate={consultation.actualDate}
                agenda={consultation.agenda}
                outcome={consultation.outcome}
                followUp={consultation.followUp}
                notes={consultation.notes}
                consultationType={(consultation as Record<string, unknown>).type as string | null ?? null}
                consultationCategory={(consultation as Record<string, unknown>).category as string | null ?? null}
                previousConsultations={previousConsultations}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {s && (
          <>
            <TabsContent value="timetable" className="mt-4">
              <Tabs defaultValue="daily">
                <TabsList className="mb-4">
                  <TabsTrigger value="daily">일간</TabsTrigger>
                  <TabsTrigger value="weekly">주간</TabsTrigger>
                </TabsList>
                <TabsContent value="daily">
                  <DayView
                    studentId={s.id}
                    entries={timetableEntries.map((e) => ({
                      id: e.id,
                      dayOfWeek: e.dayOfWeek,
                      startTime: e.startTime,
                      endTime: e.endTime,
                      subject: e.subject,
                      details: e.details ?? null,
                      colorCode: e.colorCode,
                      allDay: e.allDay,
                    }))}
                    initialDate={
                      consultation.scheduledAt
                        ? consultation.scheduledAt.toISOString().slice(0, 10)
                        : undefined
                    }
                    schoolEvents={schoolEvents}
                  />
                </TabsContent>
                <TabsContent value="weekly">
                  <TimetableGrid
                    studentId={s.id}
                    studentName={s.name}
                    initialEntries={timetableEntries.map((e) => ({
                      id: e.id,
                      dayOfWeek: e.dayOfWeek,
                      startTime: e.startTime,
                      endTime: e.endTime,
                      subject: e.subject,
                      details: e.details ?? null,
                      colorCode: e.colorCode,
                      allDay: e.allDay,
                    }))}
                    schoolEvents={schoolEvents}
                  />
                </TabsContent>
              </Tabs>
            </TabsContent>

            <TabsContent value="assignments" className="mt-4">
              <AssignmentPanel
                studentId={s.id}
                studentName={s.name}
                initialItems={s.assignments}
              />
            </TabsContent>

            <TabsContent value="communications" className="mt-4">
              <CommunicationPanel
                studentId={s.id}
                initialItems={s.communications}
              />
            </TabsContent>

            <TabsContent value="scores" className="mt-4">
              <ExamScoreChart
                studentId={s.id}
                initialScores={s.examScores}
              />
            </TabsContent>

            <TabsContent value="studentinfo" className="mt-4">
              <Card className="border-border bg-muted/20">
                <CardContent className="pt-4 pb-4">
                  <StudentInfoReveal
                    mentoringNotes={s.mentoringNotes}
                    internalScoreRange={s.internalScoreRange}
                    mockScoreRange={s.mockScoreRange}
                    targetUniversity={s.targetUniversity}
                    studentInfo={s.studentInfo}
                    selectedSubjects={s.selectedSubjects}
                    admissionType={s.admissionType}
                    onlineLectures={s.onlineLectures}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
