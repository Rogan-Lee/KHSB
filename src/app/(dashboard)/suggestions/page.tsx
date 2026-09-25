import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isStaff, isFullAccess } from "@/lib/roles";
import { getStudentSuggestions } from "@/actions/student-suggestions";
import { StudentSuggestionBoard } from "@/components/suggestions/student-suggestion-board";
import { PageHeader, StatusBadge } from "@/components/backoffice/ui";

export const dynamic = "force-dynamic";

export default async function StaffSuggestionsPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  if (!isStaff(session.user.role)) redirect("/");

  const suggestions = await getStudentSuggestions();
  const receivedCount = suggestions.filter((s) => s.status === "RECEIVED").length;

  return (
    <>
      <PageHeader
        title="학생 건의사항"
        meta={receivedCount > 0 ? <StatusBadge tone="warn" size="large">새 접수 {receivedCount}건</StatusBadge> : undefined}
        description="재원생이 올린 건의사항이에요. 상태를 바꾸고 답변을 남기면 학생 포털에 안내돼요. (전 직원 확인·관리)"
      />

      <StudentSuggestionBoard initial={suggestions} canDelete={isFullAccess(session.user.role)} />
    </>
  );
}
