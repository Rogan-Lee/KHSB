import { redirect } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";
import { auth } from "@/lib/auth";
import { isStaff, isFullAccess } from "@/lib/roles";
import { getStudentSuggestions } from "@/actions/student-suggestions";
import { StudentSuggestionBoard } from "@/components/suggestions/student-suggestion-board";

export const dynamic = "force-dynamic";

export default async function StaffSuggestionsPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  if (!isStaff(session.user.role)) redirect("/");

  const suggestions = await getStudentSuggestions();

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <div className="mb-1 flex items-center gap-2">
        <MessageSquarePlus className="h-5 w-5 text-brand" />
        <h1 className="text-xl font-bold tracking-tight">학생 건의사항</h1>
      </div>
      <p className="mb-5 text-sm text-muted-foreground">
        재원생이 올린 건의사항 — 상태를 변경하고 답변을 남기면 학생 포털에 안내됩니다. (전 직원 확인·관리)
      </p>

      <StudentSuggestionBoard initial={suggestions} canDelete={isFullAccess(session.user.role)} />
    </div>
  );
}
