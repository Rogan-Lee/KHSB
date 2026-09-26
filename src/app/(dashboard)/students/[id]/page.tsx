import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { formatDate, formatTime, parseSchool } from "@/lib/utils";
import { calcPointBalance } from "@/lib/points";
import { StudentForm } from "@/components/students/student-form";
import { StudentScheduleEditor } from "@/components/students/student-schedule-editor";
import { CommunicationPanel } from "@/components/communications/communication-panel";
import dynamic from "next/dynamic";
const ExamScoreChart = dynamic(() => import("@/components/students/exam-score-chart").then(m => m.ExamScoreChart));
import { AssignmentPanel } from "@/components/assignments/assignment-panel";
import { StudentMentoringHistory } from "@/components/students/student-mentoring-history";
import { StudentDetailTabs } from "@/components/students/student-detail-tabs";
import { StudentAvatar } from "@/components/students/student-avatar";
import { STUDENT_STATUS } from "@/components/students/student-status";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DescriptionList,
  EmptyState,
  PageHeader,
  Section,
  StatCard,
  StatCards,
  StatusBadge,
  type Tone,
} from "@/components/backoffice/ui";
import { CalendarCheck, MessagesSquare, Phone, Scale } from "lucide-react";
import { requireDashboardSession } from "../../_lib/page-guard";

const ATTENDANCE_TYPE_MAP: Record<string, { label: string; tone: Tone }> = {
  NORMAL: { label: "정상", tone: "ok" },
  ABSENT: { label: "결석", tone: "bad" },
  TARDY: { label: "지각", tone: "warn" },
  EARLY_LEAVE: { label: "정상", tone: "ok" },
  APPROVED_ABSENT: { label: "공결", tone: "info" },
  NOTIFIED_ABSENT: { label: "미입실", tone: "gray" },
};

const CONSULTATION_STATUS: Record<string, { label: string; tone: Tone }> = {
  SCHEDULED: { label: "예정", tone: "info" },
  COMPLETED: { label: "완료", tone: "ok" },
  CANCELLED: { label: "취소", tone: "gray" },
};

export default async function StudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireDashboardSession();
  const { id: rawId } = await params;
  await searchParams; // 탭(?tab=)은 StudentDetailTabs 가 URL 에서 직접 읽는다
  const id = decodeURIComponent(rawId);

  let student;
  try {
    student = await prisma.student.findUnique({
      where: { id },
      include: {
        mentor: { select: { id: true, name: true } },
        schedules: { orderBy: { dayOfWeek: "asc" } },
        outings: { orderBy: { dayOfWeek: "asc" } },
        attendances: { orderBy: { date: "desc" }, take: 30 },
        merits: { orderBy: { date: "desc" }, take: 20 },
        mentorings: {
          orderBy: { scheduledAt: "desc" },
          take: 20,
          include: { mentor: { select: { name: true } } },
        },
        consultations: { orderBy: { scheduledAt: "desc" }, take: 10 },
        communications: { orderBy: { createdAt: "desc" }, take: 30 },
        examScores: { orderBy: { examDate: "desc" } },
        assignments: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
  } catch (e) {
    console.error("[StudentDetail] Prisma error:", e);
    throw e;
  }

  if (!student) notFound();

  const [mentors, schoolRows, seatRows] = await Promise.all([
    prisma.user.findMany({
      // 학생 상세 페이지 멘토 재배정 picker — 퇴사자 제외
      where: { status: "ACTIVE", role: { in: ["SUPER_ADMIN", "DIRECTOR", "HEAD_MENTOR", "MENTOR"] } },
      select: { id: true, name: true },
    }),
    prisma.student.findMany({ select: { school: true } }),
    prisma.student.findMany({
      where: { status: "ACTIVE", seat: { not: null }, id: { not: student.id } },
      select: { seat: true },
    }),
  ]);

  const schools = [...new Set(schoolRows.map((s) => parseSchool(s.school ?? "")).filter(Boolean))].sort();
  const occupiedSeats = seatRows.map((s) => s.seat!);

  // ponytail: 기존 동작 유지 — 최근 20건(take: 20) 기준 합산
  const { merit: totalMerits, demerit: totalDemerits } = calcPointBalance({
    merits: student.merits,
  });

  const status = STUDENT_STATUS[student.status];
  const netPoints = totalMerits - totalDemerits;
  const summary = [
    [student.school, student.grade].filter(Boolean).join(" "),
    student.classGroup,
    student.seat ? `좌석 ${student.seat}번` : "좌석 미배정",
    student.mentor ? `담당 ${student.mentor.name}` : "담당 멘토 미배정",
  ].filter(Boolean).join(" · ");

  const profileItems = [
    { label: "학생 연락처", value: student.phone || "—" },
    { label: "학부모 연락처", value: student.parentPhone || "—" },
    { label: "학부모 이메일", value: student.parentEmail || "—" },
    { label: "등원일", value: formatDate(student.startDate) },
    { label: "희망 대학", value: student.targetUniversity || "—" },
    {
      label: "성적대 (내신 / 모의)",
      value:
        student.internalScoreRange || student.mockScoreRange
          ? `${student.internalScoreRange || "—"} / ${student.mockScoreRange || "—"}`
          : "—",
    },
    ...(student.mentoringNotes
      ? [{ label: "멘토링 주의사항", value: <span className="whitespace-pre-line">{student.mentoringNotes}</span>, full: true }]
      : []),
  ];

  return (
    <div>
      <PageHeader
        back={{ href: "/students", label: "원생 목록" }}
        title={
          <span className="inline-flex items-center gap-x3">
            <StudentAvatar name={student.name} imageUrl={student.imageUrl} size={40} />
            {student.name}
          </span>
        }
        meta={<StatusBadge tone={status.tone} size="large">{status.label}</StatusBadge>}
        description={<span className="tabular-nums">{summary}</span>}
        actions={
          student.parentPhone ? (
            <Button variant="outline" asChild>
              <a href={`tel:${student.parentPhone}`}>
                <Phone />
                학부모 전화
              </a>
            </Button>
          ) : undefined
        }
      />

      {/* 요약 — 프로필 + 지표 */}
      <div className="mb-x8 grid grid-cols-1 gap-x3 xl:grid-cols-2">
        <Section title="프로필">
          <DescriptionList items={profileItems} cols={2} />
        </Section>
        <StatCards cols={2} className="lg:grid-cols-4 xl:grid-cols-2">
          <StatCard
            label="이번 달 출석"
            value={student.attendances.filter((a) => a.type === "NORMAL").length}
            unit="일"
            sub="최근 출결 30건 기준"
          />
          <StatCard label="누적 상점" value={totalMerits} unit="점" tone={totalMerits > 0 ? "ok" : "gray"} sub="최근 20건 기준" />
          <StatCard label="누적 벌점" value={totalDemerits} unit="점" tone={totalDemerits > 0 ? "bad" : "gray"} sub="최근 20건 기준" />
          <StatCard label="순점수" value={netPoints} unit="점" tone={netPoints >= 0 ? "ok" : "bad"} />
        </StatCards>
      </div>

      {/* Tabs */}
      <StudentDetailTabs
        defaultTab="info"
        tabItems={[
          { value: "info", label: "기본 정보" },
          { value: "schedule", label: "입퇴실 일정" },
          { value: "attendance", label: "출결 기록" },
          { value: "merits", label: "상벌점" },
          { value: "mentoring", label: "멘토링" },
          { value: "consultation", label: "면담" },
          { value: "assignments", label: "과제", badge: student.assignments.filter((a) => !a.isCompleted).length },
          { value: "communications", label: "요청/전달", badge: student.communications.filter((c) => !c.isChecked).length },
          { value: "scores", label: "성적" },
        ]}
      >

        <TabsContent value="info">
          <Section title="기본 정보 수정" description="원생 정보를 고친 뒤 아래 수정 버튼을 눌러 저장하세요.">
            <StudentForm student={student} mentors={mentors} schools={schools} occupiedSeats={occupiedSeats} />
          </Section>
        </TabsContent>

        <TabsContent value="schedule">
          <Section
            title="입퇴실 약속 일정"
            description="등원 요일을 체크하고 입·퇴실 시간을 입력하세요. 외출 약속이 있으면 해당 요일에 외출을 추가하세요."
            flush
            className="overflow-hidden"
          >
            <StudentScheduleEditor studentId={student.id} schedules={student.schedules} outings={student.outings} />
          </Section>
        </TabsContent>

        <TabsContent value="attendance">
          <Section title="최근 출결 기록" description="최근 30건" flush className="overflow-hidden">
            {student.attendances.length === 0 ? (
              <EmptyState compact icon={CalendarCheck} title="출결 기록이 없어요" className="border-t border-stroke-neutral-muted" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead>입실</TableHead>
                    <TableHead>퇴실</TableHead>
                    <TableHead>비고</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {student.attendances.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(a.date)}</TableCell>
                      <TableCell>
                        <StatusBadge tone={ATTENDANCE_TYPE_MAP[a.type].tone}>
                          {ATTENDANCE_TYPE_MAP[a.type].label}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{a.checkIn ? formatTime(a.checkIn) : <span className="text-fg-placeholder">—</span>}</TableCell>
                      <TableCell className="whitespace-nowrap">{a.checkOut ? formatTime(a.checkOut) : <span className="text-fg-placeholder">—</span>}</TableCell>
                      <TableCell className="text-fg-neutral-muted">{a.notes || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Section>
        </TabsContent>

        <TabsContent value="merits">
          <Section title="상벌점 내역" description="최근 20건" flush className="overflow-hidden">
            {student.merits.length === 0 ? (
              <EmptyState compact icon={Scale} title="상벌점 내역이 없어요" className="border-t border-stroke-neutral-muted" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead>구분</TableHead>
                    <TableHead className="text-right">점수</TableHead>
                    <TableHead>카테고리</TableHead>
                    <TableHead>사유</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {student.merits.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(m.date)}</TableCell>
                      <TableCell>
                        <StatusBadge tone={m.type === "MERIT" ? "ok" : "bad"}>
                          {m.type === "MERIT" ? "상점" : "벌점"}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className={m.type === "MERIT" ? "text-right t4-bold text-fg-positive" : "text-right t4-bold text-fg-critical"}>
                        {m.type === "MERIT" ? "+" : "-"}{m.points}
                      </TableCell>
                      <TableCell className="text-fg-neutral-muted">{m.category || "—"}</TableCell>
                      <TableCell>{m.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Section>
        </TabsContent>

        <TabsContent value="mentoring">
          <StudentMentoringHistory studentId={student.id} mentorings={student.mentorings} />
        </TabsContent>

        <TabsContent value="consultation">
          <Section title="원장 면담 기록" description="최근 10건" flush className="overflow-hidden">
            {student.consultations.length === 0 ? (
              <EmptyState compact icon={MessagesSquare} title="면담 기록이 없어요" className="border-t border-stroke-neutral-muted" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>예정일</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>주제</TableHead>
                    <TableHead>결과</TableHead>
                    <TableHead className="w-20"><span className="sr-only">수정</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {student.consultations.map((c) => {
                    const cs = CONSULTATION_STATUS[c.status] ?? CONSULTATION_STATUS.CANCELLED;
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="whitespace-nowrap">{c.scheduledAt ? formatDate(c.scheduledAt) : "—"}</TableCell>
                        <TableCell>
                          <StatusBadge tone={cs.tone}>{cs.label}</StatusBadge>
                        </TableCell>
                        <TableCell>{c.agenda || "—"}</TableCell>
                        <TableCell className="t3-regular text-fg-neutral-muted">{c.outcome || "—"}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="xs" asChild>
                            <Link href={`/consultations/${c.id}`}>수정</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Section>
        </TabsContent>

        <TabsContent value="assignments">
          <Section>
            <AssignmentPanel
              studentId={student.id}
              studentName={student.name}
              initialItems={student.assignments}
            />
          </Section>
        </TabsContent>

        <TabsContent value="communications">
          <Section>
            <CommunicationPanel
              studentId={student.id}
              initialItems={student.communications}
            />
          </Section>
        </TabsContent>

        <TabsContent value="scores">
          <ExamScoreChart
            studentId={student.id}
            initialScores={student.examScores}
          />
        </TabsContent>
      </StudentDetailTabs>
    </div>
  );
}
