import { redirect } from "next/navigation";
import { validateMagicLink } from "@/lib/student-auth";
import { todayKST } from "@/lib/utils";
import { listMyScheduleProposals } from "@/actions/online/schedule-proposals";
import { getMyDailyPlans, getMyWeekSchedule } from "@/actions/student-schedule";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScheduleSubmitPanel } from "./_components/schedule-submit-panel";
import { MySchedulePanel } from "./_components/my-schedule-panel";

export const dynamic = "force-dynamic";

export default async function StudentSchedulePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await validateMagicLink(token);
  if (!session) redirect("/s/expired");

  const [history, week, plans] = await Promise.all([
    listMyScheduleProposals(token),
    getMyWeekSchedule(token),
    getMyDailyPlans(token),
  ]);

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <Tabs defaultValue="my-schedule">
        <TabsList className="mb-4 grid w-full grid-cols-2">
          <TabsTrigger value="my-schedule">내 일정</TabsTrigger>
          <TabsTrigger value="submit">등원 스케줄</TabsTrigger>
        </TabsList>
        <TabsContent value="my-schedule">
          <MySchedulePanel
            token={token}
            weekStart={week.weekStart}
            todayStr={todayKST().toISOString().slice(0, 10)}
            timetable={week.timetable}
            events={week.events}
            plans={plans}
          />
        </TabsContent>
        <TabsContent value="submit">
          <ScheduleSubmitPanel token={token} history={history} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
