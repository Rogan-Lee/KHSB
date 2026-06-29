import { SignUpForm } from "@/components/auth/sign-up-form";
import {
  findValidAuthInvitation,
  toPublicInvitation,
} from "@/lib/auth-invitations";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  const invitation = await findValidAuthInvitation(token);

  return (
    <SignUpForm
      invitation={invitation ? toPublicInvitation(invitation) : null}
      token={token}
    />
  );
}
