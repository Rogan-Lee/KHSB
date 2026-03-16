import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { NewMentoringDialog } from "@/components/mentoring/new-mentoring-dialog";
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
    where: isDirector ? undefined : { mentorId: session?.user?.id },
    include: {
      student: { select: { id: true, name: true, grade: true } },
      mentor: { select: { id: true, name: true } },
    },
    orderBy: { scheduledAt: "desc" },
    take: 50,
  });

  const todaySlots = await getTodayWorkingMentors();

  const students = await prisma.student.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, grade: true, school: true },
    orderBy: { name: "asc" },
  });

  const mentors = isDirector
    ? await prisma.user.findMany({
        where: { role: { in: ["MENTOR", "STAFF", "DIRECTOR", "ADMIN"] } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  const upcoming = mentorings.filter((m) => m.status === "SCHEDULED").length;
  const completed = mentorings.filter((m) => m.status === "COMPLETED").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
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
          <NewMentoringDialog students={students} />
        </CardHeader>
        <CardContent>
          <MentoringList mentorings={mentorings} mentors={mentors} isDirector={isDirector} />
        </CardContent>
      </Card>
    </div>
  );
}
