export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getTimetableEntries, getStudentSchoolEvents } from "@/actions/timetable";
import { TimetableGrid } from "@/components/timetable/timetable-grid";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { MentoringRecordForm, type PreviousMentoring } from "@/components/mentoring/mentoring-record-form";
import { CommunicationPanel } from "@/components/communications/communication-panel";
import nextDynamic from "next/dynamic";
const ExamScoreChart = nextDynamic(() => import("@/components/students/exam-score-chart").then(m => m.ExamScoreChart));
import { AssignmentPanel } from "@/components/assignments/assignment-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, formatDate } from "@/lib/utils";
import { StudentInfoReveal } from "@/components/mentoring/student-info-reveal";
import { StudyQuantityPanel } from "@/components/mentoring/study-quantity-panel";
import { MentoringStatusBadge } from "@/components/mentoring/mentoring-status";
import { getStudentStudyAnalysis } from "@/actions/reports";
import { PencilLine, UserRound } from "lucide-react";
import { CountBadge, DescriptionList, EmptyState, PageHeader, Section, StatusBadge } from "@/components/backoffice/ui";
import { isStaff } from "@/lib/roles";
import { requireDashboardSession } from "../../_lib/page-guard";

export default async function MentoringDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; studentId?: string }>;
}) {
  // 오프라인 멘토링 업무 — /mentoring 목록과 같은 기준 (온라인 전용 역할 제외).
  // getStudentStudyAnalysis 는 자체 인증 없이 이 라우트의 보호에 의존한다.
  await requireDashboardSession(isStaff);

  const { id } = await params;
  const { from, studentId: rawFromStudentId } = await searchParams;
  // 뒤로가기 링크에 들어가는 쿼리 값 — id 형태(cuid)만 허용해 경로 조작(../, //) 차단
  const fromStudentId =
    rawFromStudentId && /^[A-Za-z0-9_-]+$/.test(rawFromStudentId) ? rawFromStudentId : undefined;
  const backUrl = from === "student" && fromStudentId
    ? `/students/${fromStudentId}?tab=mentoring`
    : "/mentoring";

  const mentoring = await prisma.mentoring.findUnique({
    where: { id },
    include: {
      student: {
        select: {
          id: true, name: true, grade: true, school: true,
          mentoringNotes: true, studentInfo: true, internalScoreRange: true,
          mockScoreRange: true, targetUniversity: true, parentEmail: true,
          selectedSubjects: true, admissionType: true, onlineLectures: true,
          communications: { orderBy: { createdAt: "desc" } },
          examScores: { orderBy: { examDate: "desc" } },
          assignments: { orderBy: { createdAt: "desc" } },
        },
      },
      mentor: { select: { id: true, name: true } },
      photos: { orderBy: { uploadedAt: "asc" } },
    },
  });

  if (!mentoring) notFound();

  const evtFrom = new Date(); evtFrom.setMonth(evtFrom.getMonth() - 3);
  const evtTo = new Date(); evtTo.setMonth(evtTo.getMonth() + 3);
  // 학습 정량 분석은 멘토링 예정일 기준 월. 과거 기록을 봐도 그 시점 컨텍스트가 노출됨.
  const analysisDate = mentoring.scheduledAt ?? new Date();
  const analysisYear = analysisDate.getFullYear();
  const analysisMonth = analysisDate.getMonth() + 1;
  // 이달 상벌점 집계 기간 (멘토링 예정월 기준)
  const monthStart = new Date(analysisYear, analysisMonth - 1, 1);
  const monthEnd = new Date(analysisYear, analysisMonth, 1);
  const [timetableEntries, mentoringSchoolEvents, studyAnalysis, monthMerits, patrolNotes] = await Promise.all([
    getTimetableEntries(mentoring.studentId),
    getStudentSchoolEvents(mentoring.studentId, evtFrom, evtTo),
    getStudentStudyAnalysis(mentoring.studentId, analysisYear, analysisMonth),
    prisma.meritDemerit.findMany({
      where: { studentId: mentoring.studentId, date: { gte: monthStart, lt: monthEnd } },
      orderBy: { date: "desc" },
      select: { id: true, date: true, type: true, points: true, reason: true, category: true },
    }),
    prisma.patrolRecord.findMany({
      where: { studentId: mentoring.studentId, status: { in: ["NOTE", "ABSENT"] } },
      orderBy: { checkedAt: "desc" },
      take: 8,
      select: { id: true, status: true, note: true, checkedAt: true, round: { select: { label: true, startedAt: true } } },
    }),
  ]);
  const meritPositive = monthMerits.filter((m) => m.type === "MERIT").reduce((sum, m) => sum + m.points, 0);
  const meritNegative = monthMerits.filter((m) => m.type === "DEMERIT").reduce((sum, m) => sum + m.points, 0);

  // 해당 학생의 직전 멘토링 (현재 시점보다 이전, 상태 무관 — 가장 최근 기록)
  const previousMentoring: PreviousMentoring | null = await prisma.mentoring.findFirst({
    where: {
      studentId: mentoring.studentId,
      id: { not: id },
      status: { not: "CANCELLED" },
      scheduledAt: { lt: mentoring.scheduledAt },
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
  const openAssignments = s.assignments.filter((a) => !a.isCompleted).length;
  const uncheckedComms = s.communications.filter((c) => !c.isChecked).length;
  const hasStudentInfo = [
    s.mentoringNotes, s.internalScoreRange, s.mockScoreRange, s.targetUniversity,
    s.studentInfo, s.selectedSubjects, s.admissionType, s.onlineLectures,
  ].some(Boolean);

  return (
    <>
      <PageHeader
        back={{ href: backUrl, label: from === "student" && fromStudentId ? "원생 상세" : "멘토링" }}
        title={`${s.name} 멘토링`}
        meta={<MentoringStatusBadge status={mentoring.status} size="large" />}
        description="이전 기록과 학습 현황을 확인하고, 오늘 멘토링 내용을 기록해요"
        actions={
          <Button asChild>
            <a href="#record">
              <PencilLine />
              기록 작성
            </a>
          </Button>
        }
      />

      <div className="flex flex-col gap-x6">
        {/* 기본 정보 */}
        <Section>
          <DescriptionList
            className="lg:grid-cols-4"
            items={[
              {
                label: "원생",
                value: (
                  <>
                    <span className="t4-bold">{s.name}</span>
                    <span className="ml-x1 t3-regular text-fg-neutral-subtle">{s.grade}{s.school ? ` · ${s.school}` : ""}</span>
                  </>
                ),
              },
              { label: "담당 멘토", value: mentoring.mentor.name },
              {
                label: "예정 일시",
                value: (
                  <span className="tabular-nums">
                    {formatDate(mentoring.scheduledAt)}
                    {mentoring.scheduledTimeStart && (
                      <span className="ml-x1 text-fg-neutral-subtle">
                        {mentoring.scheduledTimeStart}~{mentoring.scheduledTimeEnd}
                      </span>
                    )}
                  </span>
                ),
              },
              {
                label: "학부모 이메일",
                value: s.parentEmail || <span className="text-fg-neutral-subtle">미등록</span>,
              },
            ]}
          />
        </Section>

        {/* 상벌점 · 순찰 특이사항 — 멘토링 시 참고 (이달 누적 + 최근 순찰 특이) */}
        {(monthMerits.length > 0 || patrolNotes.length > 0) && (
          <Section
            title="상벌점 · 순찰 특이사항"
            description={`${analysisYear}.${String(analysisMonth).padStart(2, "0")} 기준 · 멘토링할 때 참고하세요`}
          >
            <div className="grid grid-cols-1 gap-x6 sm:grid-cols-2">
              <div>
                <div className="mb-x2 flex flex-wrap items-center gap-x1_5">
                  <p className="t4-medium text-fg-neutral">이달 상벌점</p>
                  {meritPositive > 0 && <StatusBadge tone="ok">상점 +{meritPositive}</StatusBadge>}
                  {meritNegative > 0 && <StatusBadge tone="bad">벌점 -{meritNegative}</StatusBadge>}
                </div>
                {monthMerits.length === 0 ? (
                  <p className="t3-regular text-fg-neutral-subtle">이달 상벌점 기록이 없어요</p>
                ) : (
                  <ul className="flex max-h-40 flex-col gap-x1_5 overflow-y-auto">
                    {monthMerits.map((m) => (
                      <li key={m.id} className="flex items-center gap-x2 t3-regular">
                        <span className="shrink-0 tabular-nums text-fg-neutral-subtle">{formatDate(m.date)}</span>
                        <span className={cn("shrink-0 t3-bold tabular-nums", m.type === "MERIT" ? "text-fg-positive" : "text-fg-critical")}>
                          {m.type === "MERIT" ? "+" : "-"}{m.points}
                        </span>
                        <span className="truncate text-fg-neutral">{m.category ? `[${m.category}] ` : ""}{m.reason}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="mb-x2 t4-medium text-fg-neutral">최근 순찰 특이사항</p>
                {patrolNotes.length === 0 ? (
                  <p className="t3-regular text-fg-neutral-subtle">최근 순찰 특이사항이 없어요</p>
                ) : (
                  <ul className="flex max-h-40 flex-col gap-x1_5 overflow-y-auto">
                    {patrolNotes.map((p) => (
                      <li key={p.id} className="flex items-center gap-x2 t3-regular">
                        <span className="shrink-0 tabular-nums text-fg-neutral-subtle">{formatDate(p.round?.startedAt ?? p.checkedAt)}</span>
                        <StatusBadge tone={p.status === "ABSENT" ? "gray" : "warn"}>
                          {p.status === "ABSENT" ? "자리비움" : "특이"}
                        </StatusBadge>
                        {p.note && <span className="truncate text-fg-neutral">{p.note}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Section>
        )}

        {/* 학습 정량 분석 — 멘토와 학생이 함께 확인하며 멘토링 자료로 활용 */}
        {studyAnalysis && (
          <StudyQuantityPanel
            studentName={s.name}
            year={analysisYear}
            month={analysisMonth}
            analysis={studyAnalysis}
          />
        )}

        <Tabs defaultValue="record" id="record" className="scroll-mt-6">
          <TabsList>
            <TabsTrigger value="record">멘토링 기록</TabsTrigger>
            <TabsTrigger value="timetable">시간표</TabsTrigger>
            <TabsTrigger value="assignments">
              과제
              <CountBadge count={openAssignments} />
            </TabsTrigger>
            <TabsTrigger value="communications">
              요청/전달
              <CountBadge count={uncheckedComms} className="bg-bg-critical-solid" />
            </TabsTrigger>
            <TabsTrigger value="scores">성적 추이</TabsTrigger>
            <TabsTrigger value="studentinfo">학생 정보</TabsTrigger>
          </TabsList>

          <TabsContent value="record">
            <Section title="멘토링 내용 기록">
              <MentoringRecordForm
                mentoring={mentoring}
                studentName={s.name}
                parentEmail={s.parentEmail}
                previousMentoring={previousMentoring}
                photos={mentoring.photos}
                backUrl={backUrl}
              />
            </Section>
          </TabsContent>

          <TabsContent value="timetable">
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

          <TabsContent value="assignments">
            <AssignmentPanel
              studentId={s.id}
              studentName={s.name}
              initialItems={s.assignments}
              mentoringId={mentoring.id}
            />
          </TabsContent>

          <TabsContent value="communications">
            <CommunicationPanel
              studentId={s.id}
              initialItems={s.communications}
            />
          </TabsContent>

          <TabsContent value="scores">
            <ExamScoreChart
              studentId={s.id}
              initialScores={s.examScores}
            />
          </TabsContent>
          <TabsContent value="studentinfo">
            <Section title="학생 정보" description="성적대·입시 정보는 눌러야 보여요">
              {hasStudentInfo ? (
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
              ) : (
                <EmptyState compact icon={UserRound} title="등록된 학생 정보가 없어요" description="원생 상세에서 성적대·입시 정보를 입력할 수 있어요" />
              )}
            </Section>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
