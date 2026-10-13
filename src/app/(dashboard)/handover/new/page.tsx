import { getStaffList } from "@/actions/handover";
import { getChecklistTemplates } from "@/actions/checklist-templates";
import { getMonthlyNotes } from "@/actions/monthly-notes";
import { getPendingTodos } from "@/actions/todos";
import { PageHeader } from "@/components/backoffice/ui";
import { HandoverFormPageWrapper } from "@/components/handover/handover-form-page-wrapper";
import { requireDashboardSession } from "../../_lib/page-guard";

export default async function NewHandoverPage() {
  await requireDashboardSession();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // 할 일은 미완료만 쓴다 (예전엔 완료 이력까지 전체 조회 + 안 쓰는 최근 인수인계·학생 목록 조회)
  const [templates, staffList, pendingTodos, monthlyNotes] =
    await Promise.all([
      getChecklistTemplates(),
      getStaffList(),
      getPendingTodos(),
      getMonthlyNotes(year, month),
    ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ href: "/handover", label: "인수인계" }}
        title="인수인계 작성"
        description="오늘 근무 내용과 다음 근무자가 할 일을 남겨 주세요."
      />

      <HandoverFormPageWrapper
        backHref="/handover"
        templates={templates}
        monthlyNotes={
          monthlyNotes as React.ComponentProps<
            typeof HandoverFormPageWrapper
          >["monthlyNotes"]
        }
        staffList={staffList}
        pendingTodos={pendingTodos}
      />
    </div>
  );
}
