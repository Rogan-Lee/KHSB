import { validateStaffMagicLink } from "@/lib/staff-auth";
import { hasGatePass, getRequestMeta } from "@/lib/token-auth";
import { getPatrolPortalData } from "@/actions/patrol";
import { StaffGate } from "@/components/magic-link-gate/staff-gate";
import { TokenNotice, reasonToNotice } from "@/components/magic-link-gate/token-notice";
import { PatrolPortal } from "./_components/patrol-portal";

export const dynamic = "force-dynamic";

export default async function StaffPatrolPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const meta = await getRequestMeta();
  const validated = await validateStaffMagicLink(token, meta);

  if (!validated) {
    const n = reasonToNotice("not_found");
    return <TokenNotice title={n.title} body={n.body} />;
  }

  const gated = await hasGatePass("STAFF", token, validated.user.id);
  if (!gated) {
    return <StaffGate token={token} />;
  }

  const initial = await getPatrolPortalData(token);
  return <PatrolPortal token={token} initial={initial} />;
}
