import { redirect } from "next/navigation";
import { ClipboardList, CheckCircle2 } from "lucide-react";
import { validateMagicLink } from "@/lib/student-auth";
import { prisma } from "@/lib/prisma";
import { SegmentTabs } from "../_components/segment-tabs";
import {
  Badge,
  EmptyState,
  ListRow,
  ProgressBar,
  Section,
  dueInfo,
} from "@/components/portal/ui";
import { TASK_STATUS } from "@/components/portal/status";
import type { PerformanceTaskStatus } from "@/generated/prisma";

type TabKey = "open" | "done";

// 제출 완료·최종 완료는 학생이 할 일이 없으므로 D-day 를 강조하지 않는다
const isSettled = (s: PerformanceTaskStatus) => s === "DONE" || s === "SUBMITTED";

/** dueDate 는 @db.Date — KST 기준 "9월 30일" */
function formatDue(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const thisYear = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCFullYear();
  const md = `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;
  return kst.getUTCFullYear() === thisYear ? md : `${kst.getUTCFullYear()}년 ${md}`;
}

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

  // 요약 카드 문구 — 가장 급한 것 하나만
  const todo = upcoming.filter((t) => !isSettled(t.status));
  const revision = todo.filter((t) => t.status === "NEEDS_REVISION").length;
  const overdue = todo.filter((t) => dueInfo(t.dueDate).days < 0).length;
  const dueSoon = todo.filter((t) => {
    const { days } = dueInfo(t.dueDate);
    return days >= 0 && days <= 3;
  }).length;
  const headline =
    revision > 0
      ? `수정할 과제가 ${revision}건 있어요`
      : overdue > 0
        ? `마감이 지난 과제가 ${overdue}건 있어요`
        : dueSoon > 0
          ? `3일 안에 마감되는 과제가 ${dueSoon}건 있어요`
          : upcoming.length > 0
            ? `진행 중인 과제가 ${upcoming.length}건 있어요`
            : "모든 과제를 끝냈어요";

  return (
    <div>
      {tasks.length > 0 && (
        <Section className="mb-x2">
          <p className="t6-bold text-fg-neutral">{headline}</p>
          <div className="mt-x3_5 flex items-center gap-x3">
            <ProgressBar value={done.length / tasks.length} tone="ok" className="flex-1" />
            <span className="shrink-0 t3-medium tabular-nums text-fg-neutral-muted">
              {done.length}/{tasks.length} 완료
            </span>
          </div>
        </Section>
      )}

      <SegmentTabs
        defaultKey="open"
        options={[
          { key: "open", label: "진행중", count: upcoming.length },
          { key: "done", label: "완료", count: done.length },
        ]}
      />

      {list.length === 0 ? (
        <Section>
          {tab === "done" ? (
            <EmptyState
              icon={CheckCircle2}
              tone="ok"
              title="완료한 과제가 없어요"
              description="최종 승인을 받은 과제가 여기에 모여요."
              className="py-x8"
            />
          ) : (
            <EmptyState
              icon={ClipboardList}
              title="진행 중인 과제가 없어요"
              description="새 수행평가가 등록되면 여기에서 알려드릴게요."
              className="py-x8"
            />
          )}
        </Section>
      ) : (
        <Section flush>
          {list.map((t) => {
            const status = TASK_STATUS[t.status];
            const due = dueInfo(t.dueDate, isSettled(t.status));
            const isDone = t.status === "DONE";
            return (
              <ListRow
                key={t.id}
                href={`/s/${token}/tasks/${t.id}`}
                meta={isDone ? undefined : <Badge tone={status.tone}>{status.label}</Badge>}
                title={t.title}
                description={
                  <span className="tabular-nums">
                    {t.subject} · {formatDue(t.dueDate)} 마감
                    {t.format ? ` · ${t.format}` : ""}
                  </span>
                }
                trailing={
                  isDone ? undefined : (
                    <Badge tone={due.tone} size="md">
                      {due.label}
                    </Badge>
                  )
                }
              />
            );
          })}
        </Section>
      )}
    </div>
  );
}
