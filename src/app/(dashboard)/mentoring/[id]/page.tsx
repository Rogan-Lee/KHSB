import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MentoringRecordForm, type PreviousMentoring } from "@/components/mentoring/mentoring-record-form";
import { CommunicationPanel } from "@/components/communications/communication-panel";
import { ExamScoreChart } from "@/components/students/exam-score-chart";
import { AssignmentPanel } from "@/components/assignments/assignment-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, parseSchool } from "@/lib/utils";
import { AlertCircle } from "lucide-react";

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

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const twoWeeksLater = new Date(today);
  twoWeeksLater.setDate(twoWeeksLater.getDate() + 21);

  const mentoring = await prisma.mentoring.findUnique({
    where: { id },
    include: {
      student: {
        select: {
          id: true, name: true, grade: true, school: true,
          mentoringNotes: true, internalScoreRange: true,
          mockScoreRange: true, targetUniversity: true, parentEmail: true,
          communications: { orderBy: { createdAt: "desc" } },
          examScores: { orderBy: { examDate: "desc" } },
          assignments: { orderBy: { createdAt: "desc" } },
        },
      },
      mentor: { select: { id: true, name: true } },
    },
  });

  if (!mentoring) notFound();

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

  // 학교 일정 조회 (해당 학교 + 개인 일정 없음, 앞뒤 2주)
  // school 필드가 "반송고2" 형태일 수 있으므로 parseSchool로 순수 학교명 추출
  const schoolName = s.school ? parseSchool(s.school) : null;
  const schoolEvents = schoolName
    ? await prisma.calendarEvent.findMany({
        where: {
          schoolName,
          type: { in: ["SCHOOL_EXAM", "SCHOOL_EVENT"] },
          startDate: { gte: today, lte: twoWeeksLater },
        },
        orderBy: { startDate: "asc" },
      })
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
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

      {/* 학생 학습 정보 */}
      {(s.mentoringNotes || s.internalScoreRange || s.mockScoreRange || s.targetUniversity) && (
        <Card className="border-orange-200 bg-orange-50/50">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
              <div className="space-y-1 text-sm w-full">
                {s.mentoringNotes && (
                  <p className="font-medium text-orange-800">{s.mentoringNotes}</p>
                )}
                <div className="grid grid-cols-3 gap-3 text-xs text-muted-foreground mt-1">
                  {s.internalScoreRange && <span>내신 {s.internalScoreRange}</span>}
                  {s.mockScoreRange && <span>모의 {s.mockScoreRange}</span>}
                  {s.targetUniversity && <span>목표 {s.targetUniversity}</span>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4 items-start">
        {/* 기록 폼 */}
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

        {/* 우측 패널: 요청/전달 + 성적 탭 */}
        <Card>
          <CardContent className="pt-4">
            <Tabs defaultValue="assignments">
              <TabsList className="w-full">
                <TabsTrigger value="assignments" className="flex-1 text-xs">
                  과제
                  {s.assignments.filter((a) => !a.isCompleted).length > 0 && (
                    <span className="ml-1.5 bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                      {s.assignments.filter((a) => !a.isCompleted).length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="communications" className="flex-1 text-xs">
                  요청/전달
                  {s.communications.filter((c) => !c.isChecked).length > 0 && (
                    <span className="ml-1.5 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                      {s.communications.filter((c) => !c.isChecked).length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="scores" className="flex-1 text-xs">성적 추이</TabsTrigger>
                <TabsTrigger value="school" className="flex-1 text-xs">
                  학교 일정
                  {schoolEvents.length > 0 && (
                    <span className="ml-1.5 bg-purple-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                      {schoolEvents.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="assignments" className="mt-4">
                <AssignmentPanel
                  studentId={s.id}
                  studentName={s.name}
                  initialItems={s.assignments}
                  mentoringId={mentoring.id}
                  compact
                />
              </TabsContent>

              <TabsContent value="communications" className="mt-4">
                <CommunicationPanel
                  studentId={s.id}
                  initialItems={s.communications}
                  compact
                />
              </TabsContent>

              <TabsContent value="scores" className="mt-4">
                <ExamScoreChart
                  studentId={s.id}
                  initialScores={s.examScores}
                />
              </TabsContent>

              <TabsContent value="school" className="mt-4">
                {!schoolName ? (
                  <p className="text-sm text-muted-foreground text-center py-6">학교 정보가 없습니다</p>
                ) : schoolEvents.length === 0 ? (
                  <div className="text-center py-6 space-y-1">
                    <p className="text-sm font-medium">{schoolName}</p>
                    <p className="text-xs text-muted-foreground">앞으로 3주간 등록된 학교 일정이 없습니다</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">{schoolName} · 앞으로 3주</p>
                    {schoolEvents.map((ev) => {
                      const start = new Date(ev.startDate);
                      const isExam = ev.type === "SCHOOL_EXAM";
                      return (
                        <div
                          key={ev.id}
                          className={`p-2.5 rounded-lg border text-sm ${isExam ? "bg-red-50 border-red-200" : "bg-purple-50 border-purple-200"}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className={`font-medium ${isExam ? "text-red-800" : "text-purple-800"}`}>{ev.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {start.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })}
                                {ev.endDate && new Date(ev.endDate).toDateString() !== start.toDateString() && (
                                  <span> ~ {new Date(ev.endDate).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}</span>
                                )}
                              </p>
                              {ev.description && <p className="text-xs text-muted-foreground mt-0.5">{ev.description}</p>}
                            </div>
                            <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded border font-medium ${isExam ? "bg-red-100 text-red-700 border-red-200" : "bg-purple-100 text-purple-700 border-purple-200"}`}>
                              {isExam ? "시험" : "행사"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
