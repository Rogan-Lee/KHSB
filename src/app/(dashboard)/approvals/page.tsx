import { redirect } from "next/navigation";
import { Inbox } from "lucide-react";
import { auth } from "@/lib/auth";
import { isStaff } from "@/lib/roles";
import { listNaps } from "@/actions/nap";
import { listNetworkRequests } from "@/actions/network-requests";
import { ApprovalsBoard } from "./_components/approvals-board";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  if (!isStaff(session.user.role)) redirect("/");

  const sp = await searchParams;
  const tab = sp.tab === "network" ? "network" : "nap";
  const [naps, networkRequests] = await Promise.all([listNaps(), listNetworkRequests()]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <div className="mb-1 flex items-center gap-2">
        <Inbox className="h-5 w-5 text-brand" />
        <h1 className="text-xl font-bold tracking-tight">신청함</h1>
      </div>
      <p className="mb-5 text-sm text-muted-foreground">
        학생의 쪽잠·네트워크 사용 신청을 승인하거나 거절하세요.
      </p>
      <ApprovalsBoard tab={tab} naps={naps} networkRequests={networkRequests} />
    </div>
  );
}
