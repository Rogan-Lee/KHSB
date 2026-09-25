import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { CalendarDays, Plus } from "lucide-react";
import { TodayMentoringPanel } from "@/components/mentoring/today-mentoring-panel";
import { MentoringList } from "@/components/mentoring/mentoring-list";
import { MentoringAnnouncement } from "@/components/mentoring/mentoring-announcement";
import { MentoringReportTab } from "@/components/mentoring/mentoring-report-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getTodayWorkingMentors } from "@/actions/mentoring";
import { getAnnouncement } from "@/actions/announcements";
import { getStudentsForReportDispatch } from "@/actions/parent-reports";
import { isFullAccess, isStaff, isOnlineStaff } from "@/lib/roles";
import { PageHeader, Section, StatCard, StatCards } from "@/components/backoffice/ui";
import { redirect } from "next/navigation";

export const revalidate = 10;

// 기본 조회 범위: 전체(날짜 필터 없음). URL ?from=YYYY-MM-DD&to=YYYY-MM-DD 가 있을 때만 서버측 범위 적용.
function parseDate(s: string | undefined, fallback: Date) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? fallback : dt;
}

export default async function MentoringPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  // 오프라인 멘토링 업무 — 온라인 전용 역할(CONSULTANT/MANAGER_MENTOR)은 접근 불가.
  // getStudentsForReportDispatch 등이 requireStaff로 throw → 페이지 전체 크래시 방지.
  if (!isStaff(session?.user?.role)) redirect("/");
  const isDirector = isFullAccess(session?.user?.role);
  const canEditAnnouncement = isStaff(session?.user?.role) || isOnlineStaff(session?.user?.role);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // 조회 범위(서버 필터). 기본값은 전체(필터 없음) — from/to 가 있을 때만 범위 적용.
  // 멘토/취소/원생명/리포트유무 등은 클라이언트에서 즉시 필터.
  const { from: fromParam, to: toParam } = await searchParams;
  const hasRange = Boolean(fromParam || toParam);
  const toIsoDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const rangeFrom = hasRange ? parseDate(fromParam, new Date(2000, 0, 1)) : null;
  const rangeToInput = hasRange ? parseDate(toParam, now) : null;
  // 종료일은 KST 23:59:59 까지 포함
  const rangeTo = rangeToInput
    ? new Date(rangeToInput.getFullYear(), rangeToInput.getMonth(), rangeToInput.getDate(), 23, 59, 59)
    : null;
  const initialFrom = rangeFrom ? toIsoDate(rangeFrom) : "";
  const initialTo = rangeTo ? toIsoDate(rangeTo) : "";

  // 이달 상벌점 집계 기간 (KST 월 시작/종료)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // 모든 쿼리를 병렬 실행
  const [mentorings, todaySlots, mentors, vocabEnrolled, announcement, todayAttendance, meritAgg, reportRows] = await Promise.all([
    prisma.mentoring.findMany({
      // 서버 측 날짜 필터 — 기본 전체, from/to 가 있을 때만 범위 적용 (멘토/원생/취소 필터는 클라이언트)
      where: hasRange ? { scheduledAt: { gte: rangeFrom!, lte: rangeTo! } } : undefined,
      include: {
        student: { select: { id: true, name: true, grade: true, seat: true, vocabTestDate: true, schedules: { select: { dayOfWeek: true, startTime: true, endTime: true } } } },
        mentor: { select: { id: true, name: true } },
        parentReports: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, token: true, createdAt: true },
        },
        _count: { select: { photos: true } },
      },
      orderBy: { scheduledAt: "desc" },
    }),
    getTodayWorkingMentors(),
    prisma.user.findMany({
      where: {
        // 멘토링 페이지 멘토 picker — 퇴사자 제외
        status: "ACTIVE",
        OR: [
          { role: { in: ["MENTOR", "HEAD_MENTOR"] } },
          // 멘토 겸직 관리자/스태프: 어드민으로 승격돼도 isMentor=true 면 드롭다운에 노출
          { isMentor: true, role: { in: ["SUPER_ADMIN", "DIRECTOR", "STAFF"] } },
        ],
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.vocabTestEnrollment.findMany({
      where: { isActive: true },
      select: { studentId: true },
    }),
    getAnnouncement("mentoring"),
    prisma.attendanceRecord.findMany({
      where: { date: new Date(today), checkIn: { not: null } },
      select: { studentId: true, checkOut: true, checkIn: true, notes: true, type: true },
    }),
    prisma.meritDemerit.groupBy({
      by: ["studentId", "type"],
      where: { date: { gte: monthStart, lt: monthEnd } },
      _sum: { points: true },
    }),
    getStudentsForReportDispatch(),
  ]);
  const vocabEnrolledIds = vocabEnrolled.map((v) => v.studentId);
  const checkedInStudentIds = new Set(
    todayAttendance.filter((a) => !a.checkOut).map((a) => a.studentId)
  );
  // 오늘 출석 특이사항 맵 (studentId → notes) + 지연입실 학생
  const attendanceNotesMap: Record<string, string> = {};
  const tardyStudentIds: string[] = [];
  for (const a of todayAttendance) {
    if (a.notes) attendanceNotesMap[a.studentId] = a.notes;
    if (a.type === "TARDY") tardyStudentIds.push(a.studentId);
  }
  // 이달 상벌점 맵 (studentId → { positive, negative })
  const meritPointsByStudent: Record<string, { positive: number; negative: number }> = {};
  for (const row of meritAgg) {
    const entry = (meritPointsByStudent[row.studentId] ??= { positive: 0, negative: 0 });
    const sum = row._sum.points ?? 0;
    if (row.type === "MERIT") entry.positive += sum;
    else if (row.type === "DEMERIT") entry.negative += sum;
  }

  // 오늘 요약 — 이미 불러온 목록에서 계산(추가 쿼리 없음). 조회 기간이 오늘을 벗어나면 표시하지 않는다.
  const includesToday = !hasRange || (initialFrom <= today && today <= initialTo);
  const todayMentorings = includesToday
    ? mentorings.filter((m) => toIsoDate(m.scheduledAt) === today && m.status !== "CANCELLED")
    : [];
  const todayDone = todayMentorings.filter((m) => m.status === "COMPLETED").length;
  const todayLeft = todayMentorings.filter((m) => m.status === "SCHEDULED").length;
  const priorityStudentIds = new Set(
    todaySlots.flatMap((slot) => slot.candidates.filter((c) => c.priority === 1).map((c) => c.studentId))
  );

  return (
    <>
      <PageHeader
        title="멘토링"
        description="오늘 멘토링 일정과 기록, 학부모 리포트를 한곳에서 관리해요"
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/mentoring/schedule">
                <CalendarDays />
                내 스케줄 관리
              </Link>
            </Button>
            <Button asChild>
              <Link href="/mentoring/new">
                <Plus />
                멘토링 등록
              </Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-x8">
        {/* 오늘 요약 */}
        <StatCards cols={4}>
          <StatCard
            label="오늘 멘토링"
            value={includesToday ? todayMentorings.length : "—"}
            unit={includesToday ? "건" : undefined}
            sub={includesToday ? `완료 ${todayDone} · 예정 ${todayLeft}` : "조회 기간에 오늘이 없어요"}
          />
          <StatCard
            label="기록 대기"
            value={includesToday ? todayLeft : "—"}
            unit={includesToday ? "건" : undefined}
            tone={includesToday && todayLeft > 0 ? "brand" : "gray"}
            sub="오늘 예정 중 완료 처리 전"
          />
          <StatCard
            label="우선 멘토링 대상"
            value={priorityStudentIds.size}
            unit="명"
            tone={priorityStudentIds.size > 0 ? "bad" : "gray"}
            sub="지금 재실 중인 1순위 원생"
          />
          <StatCard
            label="재실 원생"
            value={checkedInStudentIds.size}
            unit="명"
            sub={`오늘 근무 멘토 ${todaySlots.length}명`}
          />
        </StatCards>

        {/* 이번 주 공지사항 */}
        <MentoringAnnouncement announcement={announcement} canEdit={canEditAnnouncement} />

        {/* 오늘의 멘토링 추천 */}
        <Section
          title="오늘의 멘토링 추천"
          description={`${today} · 근무 멘토별로 지금 재실 중인 원생을 우선순위대로 보여 줘요`}
          flush
        >
          <TodayMentoringPanel slots={todaySlots} today={today} />
        </Section>

        <Tabs defaultValue="list">
          <TabsList>
            <TabsTrigger value="list">멘토링 기록</TabsTrigger>
            <TabsTrigger value="report">리포트 발송</TabsTrigger>
          </TabsList>

          <TabsContent value="list">
            <MentoringList mentorings={mentorings} mentors={mentors} isDirector={isDirector} currentUserId={session?.user?.id} checkedInStudentIds={[...checkedInStudentIds]} vocabEnrolledStudentIds={vocabEnrolledIds} attendanceNotes={attendanceNotesMap} tardyStudentIds={tardyStudentIds} meritPoints={meritPointsByStudent} initialDateFrom={initialFrom} initialDateTo={initialTo} />
          </TabsContent>

          <TabsContent value="report">
            <p className="mb-x4 t4-regular text-fg-neutral-subtle">
              원생을 여러 명 골라 리포트를 한 번에 만들고, 내용을 다듬은 뒤 카카오톡·문자로 보내요.
            </p>
            <MentoringReportTab rows={reportRows} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
