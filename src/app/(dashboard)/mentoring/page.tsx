import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";
import { TodayMentoringPanel } from "@/components/mentoring/today-mentoring-panel";
import { MentoringList } from "@/components/mentoring/mentoring-list";
import { MentoringAnnouncement } from "@/components/mentoring/mentoring-announcement";
import { getTodayWorkingMentors } from "@/actions/mentoring";
import { getAnnouncement } from "@/actions/announcements";
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

  // 모든 쿼리를 병렬 실행 (순차 6개 → 병렬 1회 RTT)
  const [mentorings, todaySlots, mentors, vocabEnrolled, announcement, todayAttendance, meritAgg] = await Promise.all([
    prisma.mentoring.findMany({
      include: {
        student: { select: { id: true, name: true, grade: true, seat: true, vocabTestDate: true, schedules: { select: { dayOfWeek: true, startTime: true, endTime: true } } } },
        mentor: { select: { id: true, name: true } },
      },
      orderBy: { scheduledAt: "desc" },
      take: 200,
    }),
    getTodayWorkingMentors(),
    prisma.user.findMany({
      where: {
        OR: [
          { role: "MENTOR" },
          { name: "정지훈", role: { in: ["ADMIN", "DIRECTOR"] } },
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
    </div>
  );
}
