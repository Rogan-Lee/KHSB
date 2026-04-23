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
import { isFullAccess } from "@/lib/roles";
import { PageIntro } from "@/components/ui/page-intro";

export const revalidate = 10;

export default async function MentoringPage() {
  const session = await auth();
  const isDirector = isFullAccess(session?.user?.role);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // 이달 상벌점 집계 기간 (KST 월 시작/종료)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // 모든 쿼리를 병렬 실행
  const [mentorings, todaySlots, mentors, vocabEnrolled, announcement, todayAttendance, meritAgg, reportRows] = await Promise.all([
    prisma.mentoring.findMany({
      include: {
        student: { select: { id: true, name: true, grade: true, seat: true, vocabTestDate: true, schedules: { select: { dayOfWeek: true, startTime: true, endTime: true } } } },
        mentor: { select: { id: true, name: true } },
        parentReports: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, token: true, createdAt: true },
        },
      },
      orderBy: { scheduledAt: "desc" },
      take: 200,
    }),
    getTodayWorkingMentors(),
    prisma.user.findMany({
      where: {
        OR: [
          { role: "MENTOR" },
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
          <MentoringAnnouncement announcement={announcement} isDirector={isDirector} />
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
              <MentoringList mentorings={mentorings} mentors={mentors} isDirector={isDirector} currentUserId={session?.user?.id} checkedInStudentIds={[...checkedInStudentIds]} vocabEnrolledStudentIds={vocabEnrolledIds} attendanceNotes={attendanceNotesMap} meritPoints={meritPointsByStudent} />
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
