import { redirect } from "next/navigation";
import { validateMagicLink } from "@/lib/student-auth";
import { listStudentSuggestions } from "@/actions/student-suggestions";
import { SuggestionPanel } from "./_components/suggestion-panel";

export const dynamic = "force-dynamic";

export default async function StudentSuggestionsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await validateMagicLink(token);
  if (!session) redirect("/s/expired");

  const suggestions = await listStudentSuggestions({ studentToken: token });

  return <SuggestionPanel token={token} initial={suggestions} />;
}
