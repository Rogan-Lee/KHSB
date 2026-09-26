import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getTimetableEntries, getStudentSchoolEvents } from "@/actions/timetable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CountBadge, DescriptionList, PageHeader, Section, StatusBadge } from "@/components/backoffice/ui";
import { DayView } from "@/components/timetable/day-view";
import { TimetableGrid } from "@/components/timetable/timetable-grid";
import { AssignmentPanel } from "@/components/assignments/assignment-panel";
import { CommunicationPanel } from "@/components/communications/communication-panel";
import dynamic from "next/dynamic";
const ExamScoreChart = dynamic(() => import("@/components/students/exam-score-chart").then(m => m.ExamScoreChart));
import { StudentInfoReveal } from "@/components/mentoring/student-info-reveal";
import { ConsultationRecordForm } from "@/components/consultations/consultation-record-form";
import { FollowUpMessagePanel } from "@/components/consultations/followup-message-panel";
import { CATEGORY_META, STATUS_META, TYPE_LABEL, formatKST } from "@/components/consultations/consultation-tones";
import { requireDashboardSession } from "../../_lib/page-guard";

export default async function ConsultationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireDashboardSession();

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

  const statusCfg = STATUS_META[consultation.status] ?? STATUS_META.SCHEDULED;
  const ownerLabel = isHeadTeacher ? "책임T 면담" : "원장 면담";
  const categoryKey = (consultation as Record<string, unknown>).category as string | null;
  const typeKey = (consultation as Record<string, unknown>).type as string | null;
  const categoryMeta = categoryKey ? CATEGORY_META[categoryKey] : null;
  const displayName = s ? s.name : consultation.prospectName ?? "—";
  const grade = s?.grade ?? consultation.prospectGrade;
  const openAssignments = s ? s.assignments.filter((a) => !a.isCompleted).length : 0;
  const uncheckedComms = s ? s.communications.filter((c) => !c.isChecked).length : 0;

  return (
    <>
      <PageHeader
        back={{ href: backHref, label: ownerLabel }}
        title={displayName}
        meta={
          <>
            <StatusBadge tone={statusCfg.tone} size="large">{statusCfg.label}</StatusBadge>
            {categoryMeta && <StatusBadge tone={categoryMeta.tone} size="large">{categoryMeta.label}</StatusBadge>}
            {isProspect && <StatusBadge tone="warn" size="large">신규 상담</StatusBadge>}
          </>
        }
        description={
          <span className="tabular-nums">
            {ownerLabel}
            {typeKey && TYPE_LABEL[typeKey] ? ` · ${TYPE_LABEL[typeKey]} 상담` : ""}
            {" · "}
            {consultation.scheduledAt ? `${formatKST(consultation.scheduledAt)} 예정` : "예정 일시 미정"}
          </span>
        }
      />

      {/* Basic info */}
      <Section className="mb-x6">
        <DescriptionList
          cols={3}
          items={[
            {
              label: "원생",
              value: (
                <>
                  {displayName}
                  {grade && <span className="ml-x1 text-fg-neutral-subtle">({grade})</span>}
                </>
              ),
            },
            ...(s
              ? [
                  { label: "학교", value: s.school || "—" },
                  {
                    label: "학부모 이메일",
                    value: s.parentEmail || <span className="text-fg-neutral-subtle">미등록</span>,
                  },
                ]
              : [{ label: "연락처", value: consultation.prospectPhone || "—" }]),
          ]}
        />
      </Section>

      {/* Tabs */}
      <Tabs defaultValue="record">
        <TabsList>
          <TabsTrigger value="record">면담 기록</TabsTrigger>
          {s && (
            <>
              <TabsTrigger value="timetable">시간표</TabsTrigger>
              <TabsTrigger value="assignments">
                과제
                <CountBadge count={openAssignments} />
              </TabsTrigger>
              <TabsTrigger value="communications">
                요청/전달
                <CountBadge count={uncheckedComms} />
              </TabsTrigger>
              <TabsTrigger value="scores">성적 추이</TabsTrigger>
              <TabsTrigger value="studentinfo">학생 정보</TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="record" className="flex flex-col gap-x4">
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

          <Section title="면담 내용 기록">
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
          </Section>
        </TabsContent>

        {s && (
          <>
            <TabsContent value="timetable">
              <Tabs defaultValue="daily">
                <TabsList variant="segment">
                  <TabsTrigger value="daily">일간</TabsTrigger>
                  <TabsTrigger value="weekly">주간</TabsTrigger>
                </TabsList>
                <TabsContent value="daily" className="mt-x4">
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
                <TabsContent value="weekly" className="mt-x4">
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

            <TabsContent value="assignments">
              <AssignmentPanel
                studentId={s.id}
                studentName={s.name}
                initialItems={s.assignments}
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
              <Section>
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
              </Section>
            </TabsContent>
          </>
        )}
      </Tabs>
    </>
  );
}
