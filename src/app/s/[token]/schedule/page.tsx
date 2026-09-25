import { redirect } from "next/navigation";
import { validateMagicLink } from "@/lib/student-auth";
import { todayKST } from "@/lib/utils";
import { listMyScheduleProposals } from "@/actions/online/schedule-proposals";
import { getMyDailyPlans, getMyWeekSchedule } from "@/actions/student-schedule";
import { ScheduleSubmitPanel } from "./_components/schedule-submit-panel";
import { MySchedulePanel } from "./_components/my-schedule-panel";
import { ScheduleTabs } from "./_components/schedule-tabs";

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
    <ScheduleTabs
      mySchedule={
        <MySchedulePanel
          token={token}
          weekStart={week.weekStart}
          todayStr={todayKST().toISOString().slice(0, 10)}
          timetable={week.timetable}
          events={week.events}
          plans={plans}
        />
      }
      submit={<ScheduleSubmitPanel token={token} history={history} />}
    />
  );
}
