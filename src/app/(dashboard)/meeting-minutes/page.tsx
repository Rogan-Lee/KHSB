import { auth } from "@/lib/auth";
import { getMeetingMinutesList } from "@/actions/meeting-minutes";
import { getStaffList } from "@/actions/handover";
import { MeetingMinutesBoard } from "@/components/meeting-minutes/meeting-minutes-board";

export default async function MeetingMinutesPage() {
  const [session, minutesList, staffList] = await Promise.all([
    auth(),
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
