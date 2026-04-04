import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRecentHandovers, getStaffList } from "@/actions/handover";
import { getChecklistTemplates } from "@/actions/checklist-templates";
import { getMonthlyNotes } from "@/actions/monthly-notes";
import { getTodos } from "@/actions/todos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/handover"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h2 className="text-xl font-bold">인수인계 작성</h2>
      </div>

      <Card>
        <CardContent className="pt-6">
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
        </CardContent>
      </Card>
    </div>
  );
}
