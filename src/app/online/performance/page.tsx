import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isOnlineStaff } from "@/lib/roles";
import type { PerformanceTaskStatus } from "@/generated/prisma";

const STATUS_LABEL: Record<PerformanceTaskStatus, string> = {
  OPEN: "진행 전",
  IN_PROGRESS: "진행 중",
  SUBMITTED: "제출 완료",
  NEEDS_REVISION: "수정 필요",
  DONE: "최종 완료",
};

const STATUS_COLORS: Record<PerformanceTaskStatus, string> = {
  OPEN: "bg-slate-100 text-slate-700",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  SUBMITTED: "bg-amber-100 text-amber-800",
  NEEDS_REVISION: "bg-red-100 text-red-800",
  DONE: "bg-emerald-100 text-emerald-800",
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
        student: { select: { id: true, name: true, grade: true } },
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

      {tasks.length === 0 ? (
        <div className="rounded-[12px] border border-line bg-panel p-8 text-center text-[13px] text-ink-4">
          조건에 해당하는 수행평가가 없습니다.
        </div>
      ) : (
        <div className="rounded-[12px] border border-line bg-panel overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead className="bg-canvas-2 text-ink-4 text-[11px] uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">학생</th>
                <th className="text-left px-3 py-2 font-semibold">과목</th>
                <th className="text-left px-3 py-2 font-semibold">제목</th>
                <th className="text-left px-3 py-2 font-semibold">마감일</th>
                <th className="text-left px-3 py-2 font-semibold">상태</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const due = t.dueDate;
                const daysLeft = Math.ceil(
                  (due.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                );
                const dueClass =
                  daysLeft < 0
                    ? "text-red-700 font-semibold"
                    : daysLeft <= 1
                      ? "text-amber-700 font-semibold"
                      : daysLeft <= 3
                        ? "text-amber-600"
                        : "text-ink-3";
                return (
                  <tr key={t.id} className="border-t border-line hover:bg-canvas-2/50 transition-colors">
                    <td className="px-3 py-2 font-medium">
                      <Link
                        href={`/online/students/${t.student.id}/tasks`}
                        className="hover:underline"
                      >
                        {t.student.name}
                      </Link>
                      <span className="ml-1 text-[11px] text-ink-5">({t.student.grade})</span>
                    </td>
                    <td className="px-3 py-2 text-ink-3">{t.subject}</td>
                    <td className="px-3 py-2 text-ink">{t.title}</td>
                    <td className={`px-3 py-2 tabular-nums ${dueClass}`}>
                      {due.toLocaleDateString("ko-KR")}
                      <span className="ml-1 text-[11px]">
                        {daysLeft < 0
                          ? `D+${-daysLeft}`
                          : daysLeft === 0
                            ? "D-Day"
                            : `D-${daysLeft}`}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded-[6px] px-2 py-0.5 text-[11.5px] font-medium ${STATUS_COLORS[t.status]}`}
                      >
                        {STATUS_LABEL[t.status]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
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
