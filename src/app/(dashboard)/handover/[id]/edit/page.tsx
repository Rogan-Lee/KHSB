import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { getHandoverById, getStaffList } from "@/actions/handover";
import { getChecklistTemplates } from "@/actions/checklist-templates";
import { getMonthlyNotes } from "@/actions/monthly-notes";
import { Card, CardContent } from "@/components/ui/card";
import { HandoverFormPageWrapper } from "@/components/handover/handover-form-page-wrapper";

export default async function EditHandoverPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

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
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href={`/handover/${id}`}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h2 className="text-xl font-bold">인수인계 수정</h2>
      </div>

      <Card>
        <CardContent className="pt-6">
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
        </CardContent>
      </Card>
    </div>
  );
}
