import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { NewFeatureRequestForm } from "@/components/feature-requests/new-feature-request-form";

export default async function NewRequestPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  return <NewFeatureRequestForm />;
}
