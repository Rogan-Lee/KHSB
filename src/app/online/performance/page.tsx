import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isAnyStaff, isFullAccess } from "@/lib/roles";
import { assignedToMeWhere } from "@/lib/student-filters";
import {
  PerformancePanel,
  type PerfPanelStudentRow,
  type PanelTaskRow,
} from "@/components/online/performance-panel";
import type { UploadedFile } from "@/actions/online/task-submissions";
import { PageHeader } from "@/components/backoffice/ui";

export default async function PerformanceOverviewPage() {
  const user = await getUser();
  if (!isAnyStaff(user?.role)) redirect("/");

  // 전 직원이 본인 담당 학생의 수행평가를 관리. 원장/SA는 전체.
  const canManage = isAnyStaff(user?.role);

  const students = await prisma.student.findMany({
    where: {
      status: "ACTIVE",
      ...(isFullAccess(user?.role) ? {} : assignedToMeWhere(user!.id)),
    },
    orderBy: [{ grade: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      grade: true,
      school: true,
      performanceTasks: {
        orderBy: { dueDate: "asc" },
        include: {
          result: true,
          submissions: {
            orderBy: { version: "desc" },
            include: {
              feedbacks: {
                orderBy: { createdAt: "asc" },
                include: { author: { select: { name: true } } },
              },
            },
          },
        },
      },
    },
  });

  const rows: PerfPanelStudentRow[] = students.map((s) => ({
    studentId: s.id,
    studentName: s.name,
    grade: s.grade,
    school: s.school,
    tasks: s.performanceTasks.map<PanelTaskRow>((t) => ({
      id: t.id,
      subject: t.subject,
      title: t.title,
      description: t.description,
      format: t.format,
      scoreWeight: t.scoreWeight,
      dueDate: t.dueDate.toISOString(),
      status: t.status,
      result: t.result
        ? {
            score: t.result.score,
            consultantSummary: t.result.consultantSummary,
            includeInReport: t.result.includeInReport,
          }
        : null,
      submissions: t.submissions.map((sub) => ({
        id: sub.id,
        version: sub.version,
        files: Array.isArray(sub.files)
          ? (sub.files as unknown as UploadedFile[])
          : [],
        note: sub.note,
        submittedAt: sub.submittedAt.toISOString(),
        feedbacks: sub.feedbacks.map((f) => ({
          id: f.id,
          authorName: f.author.name,
          content: f.content,
          status: f.status,
          createdAt: f.createdAt.toISOString(),
          files: Array.isArray(f.files) ? (f.files as unknown as UploadedFile[]) : [],
        })),
      })),
    })),
  }));

  return (
    <div>
      <PageHeader
        title="수행평가"
        description="학생을 고르면 과제 등록·상태 변경·피드백 작성까지 한 화면에서 할 수 있어요."
      />

      <PerformancePanel rows={rows} canManage={canManage} />
    </div>
  );
}
