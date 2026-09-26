import { notFound } from "next/navigation";
import { getFeatureRequestById } from "@/actions/feature-requests";
import { FeatureRequestDetail } from "@/components/feature-requests/feature-request-detail";
import { requireDashboardSession } from "../../_lib/page-guard";

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireDashboardSession();

  const { id } = await params;
  const request = await getFeatureRequestById(id);
  if (!request) notFound();

  return (
    <FeatureRequestDetail
      request={request}
      currentUser={{ id: session.user.id, role: session.user.role }}
    />
  );
}
