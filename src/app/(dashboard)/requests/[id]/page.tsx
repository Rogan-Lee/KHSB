import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getFeatureRequestById } from "@/actions/feature-requests";
import { FeatureRequestDetail } from "@/components/feature-requests/feature-request-detail";

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

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
