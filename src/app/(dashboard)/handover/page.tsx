import { getRecentHandovers, getStaffList } from "@/actions/handover";
import { HandoverBoard } from "@/components/handover/handover-board";
import { auth } from "@/lib/auth";

export default async function HandoverPage() {
  const session = await auth();

  const [handovers, staffList] = await Promise.all([
    getRecentHandovers(14),
    getStaffList(),
  ]);

  return (
    <HandoverBoard
      initialHandovers={handovers as Parameters<typeof HandoverBoard>[0]["initialHandovers"]}
      staffList={staffList}
      currentUserId={session?.user?.id ?? ""}
      currentUserName={session?.user?.name ?? ""}
      currentUserRole={session?.user?.role ?? ""}
    />
  );
}
