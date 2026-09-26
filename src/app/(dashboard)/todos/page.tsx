export const revalidate = 30;

import { getTodos } from "@/actions/todos";
import { getStaffList } from "@/actions/handover";
import { getChecklistTemplates } from "@/actions/checklist-templates";
import { TodoManager } from "@/components/todos/todo-manager";
import { requireDashboardSession } from "../_lib/page-guard";

export default async function TodosPage() {
  const session = await requireDashboardSession();

  const [todos, staffList, templates] = await Promise.all([
    getTodos(),
    getStaffList(),
    getChecklistTemplates(),
  ]);

  return (
    <TodoManager
      initialTodos={todos as Parameters<typeof TodoManager>[0]["initialTodos"]}
      staffList={staffList}
      currentUserId={session?.user?.id ?? ""}
      currentUserName={session?.user?.name ?? ""}
      currentUserRole={session?.user?.role ?? ""}
      initialTemplates={templates}
    />
  );
}
