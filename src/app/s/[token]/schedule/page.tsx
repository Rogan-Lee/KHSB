import { redirect } from "next/navigation";
import { validateMagicLink } from "@/lib/student-auth";
import { listMyScheduleProposals } from "@/actions/online/schedule-proposals";
import { ScheduleSubmitPanel } from "./_components/schedule-submit-panel";

export const dynamic = "force-dynamic";

export default async function StudentSchedulePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await validateMagicLink(token);
  if (!session) redirect("/s/expired");

  const history = await listMyScheduleProposals(token);

  return <ScheduleSubmitPanel token={token} history={history} />;
}
