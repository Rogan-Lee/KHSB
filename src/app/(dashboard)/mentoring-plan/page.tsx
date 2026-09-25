export const revalidate = 30;

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getWeeklyPlanData } from "@/actions/mentoring-plan";
import { WeeklyPlanBoard } from "@/components/mentoring/weekly-plan-board";
import { offlineStudentWhere } from "@/lib/student-filters";
import { PageHeader } from "@/components/backoffice/ui";

function getThisMondayKST(): string {
  const kstNow = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  const day = kstNow.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // 일요일이면 전주 월요일, 그 외는 이번 주 월요일
  const mon = new Date(kstNow.getTime() + diff * 24 * 60 * 60 * 1000);
  return mon.toISOString().slice(0, 10);
}

export default async function MentoringPlanPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const role = session.user.role;
  const readonly = role === "MENTOR";

  const weekStart = getThisMondayKST();
  const [mentors, allStudents] = await Promise.all([
    getWeeklyPlanData(weekStart),
    prisma.student.findMany({
      where: offlineStudentWhere({ status: "ACTIVE" }),
      select: { id: true, name: true, grade: true, seat: true, mentorId: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="주간 멘토링 계획"
        description="멘토 근무 일정과 담당 원생 입실 예정을 보고 한 주 멘토링을 계획해요"
      />
      <WeeklyPlanBoard initialMentors={mentors} initialWeekStart={weekStart} allStudents={allStudents} readonly={readonly} />
    </>
  );
}
