import { redirect } from "next/navigation";
import { validateMagicLink } from "@/lib/student-auth";
import { getStudentPointsData } from "@/actions/rewards";
import { PointsPanel } from "./_components/points-panel";

export const dynamic = "force-dynamic";

export default async function StudentPointsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await validateMagicLink(token);
  if (!session) redirect("/s/expired");

  const data = await getStudentPointsData(token);

  return <PointsPanel token={token} data={data} />;
}
