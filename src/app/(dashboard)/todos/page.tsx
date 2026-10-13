export const revalidate = 30;

import { getTodoBoard } from "@/actions/todos";
import { getStaffList } from "@/actions/handover";
import { getChecklistTemplates } from "@/actions/checklist-templates";
import { TodoManager } from "@/components/todos/todo-manager";
import { requireDashboardSession } from "../_lib/page-guard";

export default async function TodosPage() {
  const session = await requireDashboardSession();

  // 미완료 전체 + 최근 완료분만 (완료 이력 전체는 화면의 "더 보기"로)
  const [{ todos, hiddenCompleted }, staffList, templates] = await Promise.all([
    getTodoBoard(),
    getStaffList(),
    getChecklistTemplates(),
  ]);

  return (
    <TodoManager
      initialTodos={todos}
      initialHiddenCompleted={hiddenCompleted}
      staffList={staffList}
      currentUserId={session?.user?.id ?? ""}
      currentUserName={session?.user?.name ?? ""}
      currentUserRole={session?.user?.role ?? ""}
      initialTemplates={templates}
    />
  );
}
