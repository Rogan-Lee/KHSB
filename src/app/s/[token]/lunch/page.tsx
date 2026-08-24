import { redirect } from "next/navigation";
import { loadLunchFormData } from "@/lib/lunch-data";
import { LunchOrderForm } from "@/components/lunch/lunch-order-form";

export const dynamic = "force-dynamic";

export default async function StudentLunchPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await loadLunchFormData(token);
  if (!data) redirect("/s/expired");

  return <LunchOrderForm {...data.form} />;
}
