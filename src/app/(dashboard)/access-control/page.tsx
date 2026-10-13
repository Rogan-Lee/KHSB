import { getAccessOverview } from "@/actions/access-control";
import { isStaff } from "@/lib/roles";
import { requireDashboardSession } from "../_lib/page-guard";
import { AccessControlBoard, type AccessTab } from "./_components/access-control-board";

export const dynamic = "force-dynamic";

const TABS: AccessTab[] = ["status", "rules", "overrides", "devices", "agents", "events"];

export default async function AccessControlPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireDashboardSession(isStaff);

  const sp = await searchParams;
  const tab = TABS.find((t) => t === sp.tab) ?? "status";
  const overview = await getAccessOverview();

  return <AccessControlBoard tab={tab} overview={overview} />;
}
