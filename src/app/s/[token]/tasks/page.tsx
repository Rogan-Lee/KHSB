import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { validateMagicLink } from "@/lib/student-auth";
import { prisma } from "@/lib/prisma";
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

export default async function StudentTasksPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await validateMagicLink(token);
  if (!session) redirect("/s/expired");

  const tasks = await prisma.performanceTask.findMany({
    where: { studentId: session.student.id },
    orderBy: [{ dueDate: "asc" }],
  });

  const upcoming = tasks.filter((t) => t.status !== "DONE");
  const done = tasks.filter((t) => t.status === "DONE");

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={`/s/${token}`}
          className="inline-flex items-center gap-1 text-[12px] text-ink-4 hover:text-ink"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          포털 홈
        </Link>
      </div>

      <header>
        <h2 className="text-[16px] font-semibold text-ink">수행평가 일정</h2>
        <p className="mt-1 text-[12.5px] text-ink-4">
          마감 임박순으로 정렬되어 있어요. 각 과제를 눌러 제출할 수 있습니다.
        </p>
      </header>

      {upcoming.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-line bg-canvas-2/50 p-6 text-center text-[12.5px] text-ink-5">
          진행 중인 수행평가가 없습니다.
        </div>
      ) : (
        <section className="space-y-2">
          {upcoming.map((t) => {
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
              <Link
                key={t.id}
                href={`/s/${token}/tasks/${t.id}`}
                className="block rounded-[10px] border border-line bg-panel p-3 hover:border-line-strong transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-ink-4 rounded bg-canvas-2 px-1.5 py-0.5">
                        {t.subject}
                      </span>
                      <span
                        className={`text-[11px] rounded px-1.5 py-0.5 ${STATUS_COLORS[t.status]}`}
                      >
                        {STATUS_LABEL[t.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] font-medium text-ink">
                      {t.title}
                      {t.format && (
                        <span className="ml-1 text-[11px] font-normal text-ink-5">
                          ({t.format})
                        </span>
                      )}
                    </p>
                    {t.description && (
                      <p className="mt-1 text-[12px] text-ink-4 leading-relaxed">
                        {t.description}
                      </p>
                    )}
                  </div>
                  <div className={`shrink-0 text-right ${dueClass}`}>
                    <div className="tabular-nums text-[12px]">
                      {due.toLocaleDateString("ko-KR")}
                    </div>
                    <div className="text-[11px]">
                      {daysLeft < 0
                        ? `D+${-daysLeft}`
                        : daysLeft === 0
                          ? "D-Day"
                          : `D-${daysLeft}`}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </section>
      )}

      {done.length > 0 && (
        <section>
          <h3 className="text-[12px] font-semibold text-ink-4 mt-4 mb-2">
            완료 ({done.length})
          </h3>
          <div className="space-y-1">
            {done.map((t) => (
              <div
                key={t.id}
                className="rounded-[8px] border border-line bg-panel px-3 py-2 text-[12px] text-ink-3 flex items-center gap-2"
              >
                <span className="text-ink-5">{t.subject}</span>
                <span className="text-ink">{t.title}</span>
                <span className="ml-auto tabular-nums text-[11px] text-ink-5">
                  {t.dueDate.toLocaleDateString("ko-KR")}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
