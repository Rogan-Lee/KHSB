import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isOnlineStaff } from "@/lib/roles";
import type { PerformanceTaskStatus } from "@/generated/prisma";
import {
  PerformanceTasksTable,
  type PerformanceTaskRow,
} from "@/components/online/performance-tasks-table";

const STATUS_LABEL: Record<PerformanceTaskStatus, string> = {
  OPEN: "진행 전",
  IN_PROGRESS: "진행 중",
  SUBMITTED: "제출 완료",
  NEEDS_REVISION: "수정 필요",
  DONE: "최종 완료",
};

export default async function PerformanceOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await getUser();
  if (!isOnlineStaff(user?.role)) redirect("/");

  const { status: statusFilter } = await searchParams;

  const where = {
    student: { isOnlineManaged: true, status: "ACTIVE" as const },
    ...(statusFilter && statusFilter !== "ALL"
      ? { status: statusFilter as PerformanceTaskStatus }
      : {}),
  };

  const [tasks, counts] = await Promise.all([
    prisma.performanceTask.findMany({
      where,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      include: {
        student: {
          select: { id: true, name: true, grade: true, school: true },
        },
        submissions: {
          orderBy: { version: "desc" },
          take: 1,
          select: {
            version: true,
            _count: { select: { feedbacks: true } },
          },
        },
      },
      take: 200,
    }),
    prisma.performanceTask.groupBy({
      by: ["status"],
      where: { student: { isOnlineManaged: true, status: "ACTIVE" } },
      _count: true,
    }),
  ]);

  const countByStatus = Object.fromEntries(
    counts.map((c) => [c.status, c._count])
  ) as Record<PerformanceTaskStatus, number>;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-ink tracking-[-0.015em]">
          수행평가 대시보드
        </h1>
        <p className="mt-1 text-[13px] text-ink-4">
          온라인 학생 전체 수행평가 · 마감 임박순
        </p>
      </header>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        <FilterChip label="전체" href="/online/performance" active={!statusFilter || statusFilter === "ALL"} />
        {(Object.keys(STATUS_LABEL) as PerformanceTaskStatus[]).map((s) => (
          <FilterChip
            key={s}
            label={`${STATUS_LABEL[s]} (${countByStatus[s] ?? 0})`}
            href={`/online/performance?status=${s}`}
            active={statusFilter === s}
          />
        ))}
      </div>

      <PerformanceTasksTable
        rows={tasks.map<PerformanceTaskRow>((t) => {
          const latest = t.submissions[0];
          return {
            id: t.id,
            subject: t.subject,
            title: t.title,
            dueDate: t.dueDate.toISOString(),
            status: t.status,
            studentId: t.student.id,
            studentName: t.student.name,
            grade: t.student.grade,
            school: t.student.school,
            latestSubmissionVersion: latest?.version ?? null,
            latestSubmissionFeedbackCount: latest?._count.feedbacks ?? 0,
          };
        })}
      />
    </div>
  );
}

function FilterChip({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
        active
          ? "bg-ink text-white"
          : "bg-panel border border-line text-ink-3 hover:text-ink hover:border-line-strong"
      }`}
    >
      {label}
    </Link>
  );
}
