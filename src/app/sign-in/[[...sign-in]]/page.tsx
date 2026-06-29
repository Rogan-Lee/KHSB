import { redirect } from "next/navigation";

import { SignInForm } from "@/components/auth/sign-in-form";
import { getAuthIdentity } from "@/lib/auth";

export default async function SignInPage() {
  const current = await getAuthIdentity();
  if (current?.identity.appUser) redirect("/");
  if (current?.identity.student) redirect("/student");

  return <SignInForm />;
}
