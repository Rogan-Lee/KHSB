import { notFound } from "next/navigation";
import { getHandoverById, getStaffList } from "@/actions/handover";
import { getChecklistTemplates } from "@/actions/checklist-templates";
import { getMonthlyNotes } from "@/actions/monthly-notes";
import { PageHeader } from "@/components/backoffice/ui";
import { HandoverFormPageWrapper } from "@/components/handover/handover-form-page-wrapper";
import { requireDashboardSession } from "../../../_lib/page-guard";

export default async function EditHandoverPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireDashboardSession();

  const { id } = await params;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [handover, templates, staffList, monthlyNotes] = await Promise.all([
    getHandoverById(id),
    getChecklistTemplates(),
    getStaffList(),
    getMonthlyNotes(year, month),
  ]);

  if (!handover) notFound();

  const editingHandover = {
    id: handover.id,
    content: handover.content,
    priority: handover.priority as "URGENT" | "NORMAL",
    category: handover.category,
    isPinned: handover.isPinned,
    recipientId: handover.recipientId,
    recipientName: handover.recipientName,
    tasks: handover.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      content: t.content,
      assigneeId: t.assigneeId,
      assigneeName: t.assigneeName,
      order: t.order,
    })),
    checklist: handover.checklist.map((c) => ({
      id: c.id,
      templateId: c.templateId,
      title: c.title,
      shiftType: c.shiftType,
      isChecked: c.isChecked,
      order: c.order,
    })),
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ href: `/handover/${id}`, label: "인수인계 상세" }}
        title="인수인계 수정"
        description="수정한 내용은 저장하면 바로 반영돼요."
      />

      <HandoverFormPageWrapper
        backHref={`/handover/${id}`}
        editingHandover={editingHandover}
        templates={templates}
        monthlyNotes={
          monthlyNotes as React.ComponentProps<
            typeof HandoverFormPageWrapper
          >["monthlyNotes"]
        }
        staffList={staffList}
      />
    </div>
  );
}
