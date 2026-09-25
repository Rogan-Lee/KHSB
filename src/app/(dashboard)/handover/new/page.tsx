import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRecentHandovers, getStaffList } from "@/actions/handover";
import { getChecklistTemplates } from "@/actions/checklist-templates";
import { getMonthlyNotes } from "@/actions/monthly-notes";
import { getTodos } from "@/actions/todos";
import { PageHeader } from "@/components/backoffice/ui";
import { HandoverFormPageWrapper } from "@/components/handover/handover-form-page-wrapper";

export default async function NewHandoverPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [templates, staffList, recentHandovers, todos, monthlyNotes, students] =
    await Promise.all([
      getChecklistTemplates(),
      getStaffList(),
      getRecentHandovers(1),
      getTodos(),
      getMonthlyNotes(year, month),
      prisma.student.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, name: true, grade: true },
        orderBy: { name: "asc" },
      }),
    ]);

  const pendingTodos = todos.filter((t) => !t.isCompleted);

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
        pendingTodos={
          pendingTodos as React.ComponentProps<
            typeof HandoverFormPageWrapper
          >["pendingTodos"]
        }
      />
    </div>
  );
}
