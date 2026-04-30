import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isOnlineStaff, isFullAccess } from "@/lib/roles";
import {
  PerformancePanel,
  type PerfPanelStudentRow,
  type PanelTaskRow,
} from "@/components/online/performance-panel";
import type { UploadedFile } from "@/actions/online/task-submissions";

export default async function PerformanceOverviewPage() {
  const user = await getUser();
  if (!isOnlineStaff(user?.role)) redirect("/");

  // 컨설턴트/원장은 관리, 멘토는 읽기 + 자기 학생 한정 (필요 시 향후 분리)
  const canManage = isFullAccess(user?.role) || user?.role === "CONSULTANT";

  const students = await prisma.student.findMany({
    where: { isOnlineManaged: true, status: "ACTIVE" },
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
        })),
      })),
    })),
  }));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-ink tracking-[-0.015em]">
          수행평가 대시보드
        </h1>
        <p className="mt-1 text-[13px] text-ink-4">
          학생을 선택하면 우측에서 과제 등록·상태 변경·피드백 작성까지 모두 진행할 수 있어요.
        </p>
      </header>

      <PerformancePanel rows={rows} canManage={canManage} />
    </div>
  );
}
