import { getRecentHandovers, getStaffList } from "@/actions/handover";
import { getChecklistTemplates } from "@/actions/checklist-templates";
import { getMonthlyNotes } from "@/actions/monthly-notes";
import { getTodos } from "@/actions/todos";
import { HandoverBoard } from "@/components/handover/handover-board";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function HandoverPage() {
  const session = await auth();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [handovers, templates, monthlyNotes, staffList, students, todos] = await Promise.all([
    getRecentHandovers(14),
    getChecklistTemplates(),
    getMonthlyNotes(year, month),
    getStaffList(),
    prisma.student.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, grade: true },
      orderBy: { name: "asc" },
    }),
    getTodos(),
  ]);

  const pendingTodos = todos.filter((t) => !t.isCompleted);

  return (
    <HandoverBoard
      initialHandovers={handovers as Parameters<typeof HandoverBoard>[0]["initialHandovers"]}
      templates={templates}
      monthlyNotes={monthlyNotes as Parameters<typeof HandoverBoard>[0]["monthlyNotes"]}
      students={students}
      staffList={staffList}
      currentUserId={session?.user?.id ?? ""}
      currentUserName={session?.user?.name ?? ""}
      currentUserRole={session?.user?.role ?? ""}
      year={year}
      month={month}
      pendingTodos={pendingTodos as Parameters<typeof HandoverBoard>[0]["pendingTodos"]}
    />
  );
}
