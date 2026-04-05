import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";
import { TodayMentoringPanel } from "@/components/mentoring/today-mentoring-panel";
import { MentoringList } from "@/components/mentoring/mentoring-list";
import { getTodayWorkingMentors } from "@/actions/mentoring";
import { Calendar } from "lucide-react";
import { isFullAccess } from "@/lib/roles";

export default async function MentoringPage() {
  const session = await auth();
  const isDirector = isFullAccess(session?.user?.role);
  // 로컬 날짜 기준 (출결 페이지와 동일)
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const mentorings = await prisma.mentoring.findMany({
    include: {
      student: { select: { id: true, name: true, grade: true } },
      mentor: { select: { id: true, name: true } },
    },
    orderBy: { scheduledAt: "desc" },
    take: 200,
  });

  const todaySlots = await getTodayWorkingMentors();

  const mentors = await prisma.user.findMany({
    where: { role: { in: ["MENTOR", "STAFF", "DIRECTOR", "ADMIN"] } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // 오늘 입실 중인 학생 ID 목록
  const todayAttendance = await prisma.attendanceRecord.findMany({
    where: {
      date: new Date(today),
      checkIn: { not: null },
    },
    select: { studentId: true, checkOut: true },
  });
  const checkedInStudentIds = new Set(
    todayAttendance.filter((a) => !a.checkOut).map((a) => a.studentId)
  );

  const upcoming = mentorings.filter((m) => m.status === "SCHEDULED").length;
  const completed = mentorings.filter((m) => m.status === "COMPLETED").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">예정된 멘토링</p>
            <p className="text-2xl font-bold">{upcoming}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">완료된 멘토링</p>
            <p className="text-2xl font-bold">{completed}건</p>
          </CardContent>
        </Card>
      </div>

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
          <MentoringList mentorings={mentorings} mentors={mentors} isDirector={isDirector} currentUserId={session?.user?.id} checkedInStudentIds={[...checkedInStudentIds]} />
        </CardContent>
      </Card>
    </div>
  );
}
