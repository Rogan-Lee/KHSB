import { notFound } from "next/navigation";
import { getTimetableEntries, getStudentSchoolEvents } from "@/actions/timetable";
import { DayView } from "@/components/timetable/day-view";
import { TimetableGrid } from "@/components/timetable/timetable-grid";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MentoringRecordForm, type PreviousMentoring } from "@/components/mentoring/mentoring-record-form";
import { CommunicationPanel } from "@/components/communications/communication-panel";
import { ExamScoreChart } from "@/components/students/exam-score-chart";
import { AssignmentPanel } from "@/components/assignments/assignment-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/lib/utils";
import { StudentInfoReveal } from "@/components/mentoring/student-info-reveal";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

const STATUS_MAP = {
  SCHEDULED: { label: "예정", variant: "secondary" as const },
  COMPLETED: { label: "완료", variant: "default" as const },
  CANCELLED: { label: "취소", variant: "destructive" as const },
  RESCHEDULED: { label: "일정변경", variant: "outline" as const },
};

export default async function MentoringDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const mentoring = await prisma.mentoring.findUnique({
    where: { id },
    include: {
      student: {
        select: {
          id: true, name: true, grade: true, school: true,
          mentoringNotes: true, studentInfo: true, internalScoreRange: true,
          mockScoreRange: true, targetUniversity: true, parentEmail: true,
          academySchedule: true, selectedSubjects: true, admissionType: true, onlineLectures: true,
          communications: { orderBy: { createdAt: "desc" } },
          examScores: { orderBy: { examDate: "desc" } },
          assignments: { orderBy: { createdAt: "desc" } },
        },
      },
      mentor: { select: { id: true, name: true } },
    },
  });

  if (!mentoring) notFound();

  const evtFrom = new Date(); evtFrom.setMonth(evtFrom.getMonth() - 3);
  const evtTo = new Date(); evtTo.setMonth(evtTo.getMonth() + 3);
  const [timetableEntries, mentoringSchoolEvents] = await Promise.all([
    getTimetableEntries(mentoring.studentId),
    getStudentSchoolEvents(mentoring.studentId, evtFrom, evtTo),
  ]);

  // 해당 학생의 직전 멘토링 (현재 제외, 상태 무관 — 가장 최근 기록)
  const previousMentoring: PreviousMentoring | null = await prisma.mentoring.findFirst({
    where: {
      studentId: mentoring.studentId,
      id: { not: id },
      status: { not: "CANCELLED" },
    },
    orderBy: { scheduledAt: "desc" },
    select: {
      id: true,
      scheduledAt: true,
      actualDate: true,
      actualStartTime: true,
      actualEndTime: true,
      content: true,
      improvements: true,
      weaknesses: true,
      nextGoals: true,
      notes: true,
    },
  });

  const s = mentoring.student;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/mentoring"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h2 className="text-xl font-bold">멘토링 기록</h2>
        <Badge variant={STATUS_MAP[mentoring.status].variant}>
          {STATUS_MAP[mentoring.status].label}
        </Badge>
      </div>

      {/* 기본 정보 */}
      <Card>
        <CardContent className="pt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">원생</p>
            <p className="font-medium">{s.name} <span className="text-muted-foreground text-xs">({s.grade})</span></p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">담당 멘토</p>
            <p className="font-medium">{mentoring.mentor.name}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">예정 일시</p>
            <p className="font-medium">
              {formatDate(mentoring.scheduledAt)}
              {mentoring.scheduledTimeStart && (
                <span className="ml-1 text-muted-foreground text-xs">
                  {mentoring.scheduledTimeStart}~{mentoring.scheduledTimeEnd}
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">학부모 이메일</p>
            <p className="text-xs">{s.parentEmail || <span className="text-muted-foreground">미등록</span>}</p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="record">
        <TabsList>
          <TabsTrigger value="record">멘토링 기록</TabsTrigger>
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
        </TabsList>

        <TabsContent value="record" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">멘토링 내용 기록</CardTitle>
            </CardHeader>
            <CardContent>
              <MentoringRecordForm
                mentoring={mentoring}
                studentName={s.name}
                parentEmail={s.parentEmail}
                previousMentoring={previousMentoring}
              />
            </CardContent>
          </Card>
        </TabsContent>

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
                initialDate={mentoring.scheduledAt.toISOString().slice(0, 10)}
                schoolEvents={mentoringSchoolEvents}
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
                schoolEvents={mentoringSchoolEvents}
              />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="assignments" className="mt-4">
          <AssignmentPanel
            studentId={s.id}
            studentName={s.name}
            initialItems={s.assignments}
            mentoringId={mentoring.id}
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
                academySchedule={s.academySchedule}
                selectedSubjects={s.selectedSubjects}
                admissionType={s.admissionType}
                onlineLectures={s.onlineLectures}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
