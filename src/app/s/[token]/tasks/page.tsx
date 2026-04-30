import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, ClipboardList, CheckCircle2 } from "lucide-react";
import { validateMagicLink } from "@/lib/student-auth";
import { prisma } from "@/lib/prisma";
import { SegmentTabs } from "../_components/segment-tabs";
import type { PerformanceTaskStatus } from "@/generated/prisma";

const STATUS_LABEL: Record<PerformanceTaskStatus, string> = {
  OPEN: "진행 전",
  IN_PROGRESS: "진행 중",
  SUBMITTED: "제출 완료",
  NEEDS_REVISION: "수정 필요",
  DONE: "최종 완료",
};

const STATUS_TONE: Record<PerformanceTaskStatus, string> = {
  OPEN: "bg-canvas-2 text-ink-3",
  IN_PROGRESS: "bg-info-soft text-info-ink",
  SUBMITTED: "bg-warn-soft text-warn-ink",
  NEEDS_REVISION: "bg-bad-soft text-bad-ink",
  DONE: "bg-ok-soft text-ok-ink",
};

type TabKey = "open" | "done";

export default async function StudentTasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const session = await validateMagicLink(token);
  if (!session) redirect("/s/expired");

  const tasks = await prisma.performanceTask.findMany({
    where: { studentId: session.student.id },
    orderBy: [{ dueDate: "asc" }],
  });

  const upcoming = tasks.filter((t) => t.status !== "DONE");
  const done = tasks.filter((t) => t.status === "DONE");

  const tab: TabKey = sp.tab === "done" ? "done" : "open";
  const list = tab === "done" ? done : upcoming;

  return (
    <div>
      <SegmentTabs
        defaultKey="open"
        options={[
          { key: "open", label: "진행중", count: upcoming.length },
          { key: "done", label: "완료", count: done.length },
        ]}
      />

      {list.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <ul className="space-y-2.5">
          {list.map((t) => (
            <li key={t.id}>
              <TaskCard token={token} task={t} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TaskCard({
  token,
  task,
}: {
  token: string;
  task: {
    id: string;
    subject: string;
    title: string;
    description: string | null;
    format: string | null;
    dueDate: Date;
    status: PerformanceTaskStatus;
  };
}) {
  const days = Math.ceil(
    (task.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  const isOverdue = days < 0 && task.status !== "DONE";
  const isUrgent = days >= 0 && days <= 1 && task.status !== "DONE";

  const dueLabel =
    days < 0 ? `D+${-days}` : days === 0 ? "D-Day" : `D-${days}`;

  const dueTone = isOverdue
    ? "bg-bad-soft text-bad-ink"
    : isUrgent
      ? "bg-warn-soft text-warn-ink"
      : days <= 3 && task.status !== "DONE"
        ? "bg-warn-soft/70 text-warn-ink"
        : "bg-canvas-2 text-ink-3";

  return (
    <Link
      href={`/s/${token}/tasks/${task.id}`}
      className={`block rounded-[14px] border bg-panel p-4 transition-colors active:bg-canvas-2 ${
        isOverdue || isUrgent
          ? "border-line shadow-xs ring-1 ring-bad/10"
          : "border-line"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-canvas-2 px-2 py-0.5 text-[10.5px] font-medium text-ink-3">
            {task.subject}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${STATUS_TONE[task.status]}`}
          >
            {STATUS_LABEL[task.status]}
          </span>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold tabular-nums ${dueTone}`}
        >
          {dueLabel}
        </span>
      </div>

      <p className="mt-2.5 text-[15px] font-semibold leading-snug text-ink">
        {task.title}
        {task.format && (
          <span className="ml-1.5 text-[11.5px] font-normal text-ink-4">
            ({task.format})
          </span>
        )}
      </p>

      {task.description && (
        <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-ink-4">
          {task.description}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
        <span className="text-[11.5px] tabular-nums text-ink-4">
          마감 {task.dueDate.toLocaleDateString("ko-KR")}
        </span>
        <span className="inline-flex items-center text-[12px] font-semibold text-brand">
          열기
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
      </div>
    </Link>
  );
}

function EmptyState({ tab }: { tab: TabKey }) {
  return (
    <div className="rounded-[14px] border border-dashed border-line bg-canvas-2/40 px-5 py-12 text-center">
      <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-panel text-ink-4">
        {tab === "done" ? (
          <CheckCircle2 className="h-6 w-6" />
        ) : (
          <ClipboardList className="h-6 w-6" />
        )}
      </span>
      <p className="mt-3 text-[13.5px] font-semibold text-ink-2">
        {tab === "done" ? "완료한 과제가 없어요" : "진행 중인 과제가 없어요"}
      </p>
      <p className="mt-1 text-[12px] text-ink-4">
        {tab === "done"
          ? "과제를 끝내면 여기에 모여요."
          : "새로운 수행평가가 등록되면 여기에 표시됩니다."}
      </p>
    </div>
  );
}
