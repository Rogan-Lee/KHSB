import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";
import { TodayMentoringPanel } from "@/components/mentoring/today-mentoring-panel";
import { MentoringList } from "@/components/mentoring/mentoring-list";
import { MentoringAnnouncement } from "@/components/mentoring/mentoring-announcement";
import { MentoringReportTab } from "@/components/mentoring/mentoring-report-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getTodayWorkingMentors } from "@/actions/mentoring";
import { getAnnouncement } from "@/actions/announcements";
import { getStudentsForReportDispatch } from "@/actions/parent-reports";
import { Calendar } from "lucide-react";
import { isFullAccess, isStaff, isOnlineStaff } from "@/lib/roles";
import { PageIntro } from "@/components/ui/page-intro";

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
      select: { studentId: true, checkOut: true, checkIn: true, notes: true },
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
  // 오늘 출석 특이사항 맵 (studentId → notes)
  const attendanceNotesMap: Record<string, string> = {};
  for (const a of todayAttendance) {
    if (a.notes) attendanceNotesMap[a.studentId] = a.notes;
  }
  // 이달 상벌점 맵 (studentId → { positive, negative })
  const meritPointsByStudent: Record<string, { positive: number; negative: number }> = {};
  for (const row of meritAgg) {
    const entry = (meritPointsByStudent[row.studentId] ??= { positive: 0, negative: 0 });
    const sum = row._sum.points ?? 0;
    if (row.type === "MERIT") entry.positive += sum;
    else if (row.type === "DEMERIT") entry.negative += sum;
  }

  return (
    <div className="space-y-6">
      <PageIntro
        tag="MENTORING · 03"
        title="멘토링"
        description="멘토링 일정 관리, 기록, 학부모 리포트"
        accent="text-info"
      />

      {/* 이번 주 공지사항 */}
      <Card>
        <CardContent className="pt-4">
          <MentoringAnnouncement announcement={announcement} canEdit={canEditAnnouncement} />
        </CardContent>
      </Card>

      {/* 오늘의 멘토링 추천 */}
      <Card>
        <CardContent className="pt-4">
          <TodayMentoringPanel slots={todaySlots} today={today} />
        </CardContent>
      </Card>

      {/* 스케줄 관리 링크 */}
      <div className="flex justify-end">
        <Link href="/mentoring/schedule">
          <Button variant="outline" size="sm">
            <Calendar className="h-4 w-4 mr-1.5" />
            내 스케줄 관리
          </Button>
        </Link>
      </div>

      <Tabs defaultValue="list" className="space-y-3">
        <TabsList>
          <TabsTrigger value="list">멘토링 기록</TabsTrigger>
          <TabsTrigger value="report">리포트 발송</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>멘토링 목록</CardTitle>
              <Link href="/mentoring/new">
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  멘토링 등록
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              <MentoringList mentorings={mentorings} mentors={mentors} isDirector={isDirector} currentUserId={session?.user?.id} checkedInStudentIds={[...checkedInStudentIds]} vocabEnrolledStudentIds={vocabEnrolledIds} attendanceNotes={attendanceNotesMap} meritPoints={meritPointsByStudent} initialDateFrom={initialFrom} initialDateTo={initialTo} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="report">
          <Card>
            <CardHeader>
              <CardTitle>학부모 리포트 발송</CardTitle>
              <p className="text-sm text-muted-foreground">
                학생 다중 선택 → 일괄 생성 → URL 내용 수정 → URL 생성 → 카카오/문자 발송
              </p>
            </CardHeader>
            <CardContent>
              <MentoringReportTab rows={reportRows} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
