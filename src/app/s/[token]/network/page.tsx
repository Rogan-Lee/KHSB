import { redirect } from "next/navigation";
import { getMyNetworkRequests } from "@/actions/network-requests";
import { NetworkPanel } from "./_components/network-panel";

export const dynamic = "force-dynamic";

export default async function StudentNetworkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const requests = await getMyNetworkRequests(token).catch(() => null);
  if (!requests) redirect("/s/expired");

  return <NetworkPanel token={token} requests={requests} />;
}
