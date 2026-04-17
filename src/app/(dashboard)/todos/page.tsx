export const revalidate = 30;

import { auth } from "@/lib/auth";
import { getTodos } from "@/actions/todos";
import { getStaffList } from "@/actions/handover";
import { getChecklistTemplates } from "@/actions/checklist-templates";
import { TodoManager } from "@/components/todos/todo-manager";

export default async function TodosPage() {
  const session = await auth();

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
