import { redirect } from "next/navigation";
import { getMyNaps } from "@/actions/nap";

export const dynamic = "force-dynamic";

import { NapPanel } from "./_components/nap-panel";

export default async function StudentNapPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getMyNaps(token).catch(() => null);
  if (!data) redirect("/s/expired");

  return <NapPanel token={token} {...data} />;
}
