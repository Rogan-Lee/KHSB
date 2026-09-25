import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isStaff } from "@/lib/roles";
import { listNaps } from "@/actions/nap";
import { listNetworkRequests } from "@/actions/network-requests";
import { PageHeader } from "@/components/backoffice/ui";
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
    <>
      <PageHeader title="신청함" description="학생의 쪽잠·네트워크 사용 신청을 승인하거나 거절해요." />
      <ApprovalsBoard tab={tab} naps={naps} networkRequests={networkRequests} />
    </>
  );
}
