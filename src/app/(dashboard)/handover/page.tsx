import { getRecentHandovers } from "@/actions/handover";
import { HandoverBoard } from "@/components/handover/handover-board";
import { auth } from "@/lib/auth";

export default async function HandoverPage() {
  const session = await auth();
  const handovers = await getRecentHandovers(14);

  return (
    <HandoverBoard
      initialHandovers={handovers}
      currentUserId={session?.user?.id ?? ""}
      currentUserName={session?.user?.name ?? ""}
    />
  );
}
