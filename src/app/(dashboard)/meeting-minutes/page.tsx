export const revalidate = 30;

import { getMeetingMinutesList } from "@/actions/meeting-minutes";
import { getStaffList } from "@/actions/handover";
import { MeetingMinutesBoard } from "@/components/meeting-minutes/meeting-minutes-board";
import { requireDashboardSession } from "../_lib/page-guard";

export default async function MeetingMinutesPage() {
  const session = await requireDashboardSession();
  const [minutesList, staffList] = await Promise.all([
    getMeetingMinutesList(),
    getStaffList(),
  ]);

  return (
    <MeetingMinutesBoard
      initialMinutes={minutesList}
      currentUserId={session?.user?.id ?? ""}
      currentUserName={session?.user?.name ?? ""}
      currentUserRole={session?.user?.role ?? ""}
      staffList={staffList}
    />
  );
}
