import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getWeeklyPlanData } from "@/actions/mentoring-plan";
import { WeeklyPlanBoard } from "@/components/mentoring/weekly-plan-board";

function getNextMondayKST(): string {
  const kstNow = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  const day = kstNow.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysUntilNextMon = day === 0 ? 1 : 8 - day;
  const nextMon = new Date(kstNow.getTime() + daysUntilNextMon * 24 * 60 * 60 * 1000);
  return nextMon.toISOString().slice(0, 10);
}

export default async function MentoringPlanPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const role = session.user.role;
  if (role !== "DIRECTOR" && role !== "ADMIN") redirect("/");

  const weekStart = getNextMondayKST();
  const mentors = await getWeeklyPlanData(weekStart);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">주간 멘토링 계획</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          멘토 근무 일정과 담당 원생 입실 예정을 바탕으로 차주 멘토링을 계획합니다.
        </p>
      </div>
      <WeeklyPlanBoard initialMentors={mentors} initialWeekStart={weekStart} />
    </div>
  );
}
