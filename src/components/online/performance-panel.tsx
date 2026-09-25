"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Plus,
  Trash2,
  ChevronRight,
  ExternalLink,
  Loader2,
  ClipboardList,
  MessageSquarePlus,
  UsersRound,
  X,
} from "lucide-react";
import {
  StudentFilterBar,
  defaultFilterState,
  matchesStudentFilter,
  deriveFilterOptions,
  type StudentFilterState,
} from "@/components/online/student-filter-bar";
import {
  TaskSubmissionsThread,
  type SubmissionVersion,
} from "@/components/online/task-submissions-thread";
import { TaskResultEditor } from "@/components/online/task-result-editor";
import {
  createPerformanceTask,
  updatePerformanceTaskStatus,
  deletePerformanceTask,
} from "@/actions/online/performance-tasks";
import type { PerformanceTaskStatus } from "@/generated/prisma";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EmptyState,
  FilterChip,
  FormActions,
  FormField,
  Section,
  StatCard,
  StatCards,
  StatusBadge,
} from "@/components/backoffice/ui";
import {
  DueDate,
  PERF_STATUS_LABEL,
  PERF_STATUS_ORDER,
  PerfStatusBadge,
  PerfStatusSelect,
  daysUntil,
} from "@/components/online/performance-status";
import { useConfirm } from "@/components/online/use-confirm";
import { MasterDetail, PickerCount, PickerItem } from "@/components/online/student-picker";

// ─────────────── 데이터 타입 ───────────────

export type PanelTaskRow = {
  id: string;
  subject: string;
  title: string;
  description: string | null;
  format: string | null;
  scoreWeight: number | null;
  dueDate: string; // ISO
  status: PerformanceTaskStatus;
  submissions: SubmissionVersion[]; // version 내림차순
  result: {
    score: string | null;
    consultantSummary: string | null;
    includeInReport: boolean;
  } | null;
};

export type PerfPanelStudentRow = {
  studentId: string;
  studentName: string;
  grade: string;
  school: string | null;
  tasks: PanelTaskRow[];
};

// ─────────────── 카운트 계산 헬퍼 ───────────────

function countTasksByStatus(
  tasks: PanelTaskRow[]
): Record<PerformanceTaskStatus, number> {
  const result: Record<PerformanceTaskStatus, number> = {
    OPEN: 0,
    IN_PROGRESS: 0,
    SUBMITTED: 0,
    NEEDS_REVISION: 0,
    DONE: 0,
  };
  for (const t of tasks) result[t.status]++;
  return result;
}

function pendingFeedbackCount(tasks: PanelTaskRow[]): number {
  // 최신 제출물에 피드백이 없고 task 가 종료(DONE)도 아닌 경우
  return tasks.filter((t) => {
    if (t.status === "DONE") return false;
    const latest = t.submissions[0];
    if (!latest) return false;
    return latest.feedbacks.length === 0;
  }).length;
}

// 학생이 아직 해야 할 일이 남은 상태 (마감 임박·지남 집계 대상)
const ACTIVE_STATUSES: PerformanceTaskStatus[] = ["OPEN", "IN_PROGRESS", "NEEDS_REVISION"];

// ─────────────── 메인 컴포넌트 ───────────────

export function PerformancePanel({
  rows,
  canManage,
}: {
  rows: PerfPanelStudentRow[];
  canManage: boolean;
}) {
  const [filter, setFilter] = useState<StudentFilterState>(defaultFilterState);
  const [activeStudentId, setActiveStudentId] = useState<string | null>(
    rows[0]?.studentId ?? null
  );
  const [statusFilter, setStatusFilter] =
    useState<PerformanceTaskStatus | "ALL">("ALL");
  // 마감 D-day 계산 기준 시각 — 화면을 연 시점으로 고정
  const [now] = useState(() => Date.now());

  const filterOptions = useMemo(() => deriveFilterOptions(rows), [rows]);

  const filteredRows = useMemo(
    () => rows.filter((r) => matchesStudentFilter(r, filter)),
    [rows, filter]
  );

  const activeRow = useMemo(
    () => rows.find((r) => r.studentId === activeStudentId) ?? null,
    [rows, activeStudentId]
  );

  // 요약 지표 — 담당 학생 전체 기준
  const summary = useMemo(() => {
    let total = 0;
    let done = 0;
    let pendingFB = 0;
    let dueSoon = 0;
    let overdue = 0;
    for (const r of rows) {
      total += r.tasks.length;
      pendingFB += pendingFeedbackCount(r.tasks);
      for (const t of r.tasks) {
        if (t.status === "DONE") done++;
        if (!ACTIVE_STATUSES.includes(t.status)) continue;
        const d = daysUntil(t.dueDate, now);
        if (d < 0) overdue++;
        else if (d <= 3) dueSoon++;
      }
    }
    return { total, done, pendingFB, dueSoon, overdue };
  }, [rows, now]);

  return (
    <div className="flex flex-col gap-x5">
      <StatCards cols={4}>
        <StatCard
          label="전체 과제"
          value={summary.total}
          unit="건"
          sub={`최종 완료 ${summary.done}건`}
        />
        <StatCard
          label="피드백 작성 필요"
          value={summary.pendingFB}
          unit="건"
          tone={summary.pendingFB > 0 ? "warn" : "gray"}
        />
        <StatCard
          label="3일 안에 마감"
          value={summary.dueSoon}
          unit="건"
          tone={summary.dueSoon > 0 ? "warn" : "gray"}
        />
        <StatCard
          label="마감 지남"
          value={summary.overdue}
          unit="건"
          tone={summary.overdue > 0 ? "bad" : "gray"}
          sub="제출 전 과제 기준"
        />
      </StatCards>

      <StudentFilterBar
        value={filter}
        onChange={setFilter}
        availableGrades={filterOptions.grades}
        availableSchools={filterOptions.schools}
        hasUnknownSchool={filterOptions.hasUnknownSchool}
        rightSlot={
          <span className="t3-regular tabular-nums text-fg-neutral-subtle">
            {filteredRows.length} / {rows.length}명
          </span>
        }
      />

      <MasterDetail
        list={
          // 좌측: 학생 리스트 — 행은 온라인 관리 공용 PickerItem. 스크롤 시 상단 바(56px) 아래에 붙는다
          <aside
            aria-label="학생 목록"
            className="flex flex-col overflow-hidden rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default lg:sticky lg:top-20"
          >
            <div className="flex min-h-12 items-center justify-between gap-x2 border-b border-stroke-neutral-muted px-x4 py-x2 t3-regular text-fg-neutral-subtle">
              <span>학생</span>
              <PickerCount shown={filteredRows.length} total={rows.length} />
            </div>
            {filteredRows.length === 0 ? (
              <EmptyState
                compact
                icon={UsersRound}
                title="조건에 맞는 학생이 없어요"
                description="필터를 바꾸거나 검색어를 지워 보세요."
              />
            ) : (
              <ul className="max-h-80 divide-y divide-stroke-neutral-muted overflow-y-auto overscroll-contain lg:max-h-[calc(100dvh-10rem)]">
                {filteredRows.map((r) => {
                  const counts = countTasksByStatus(r.tasks);
                  const pendingFB = pendingFeedbackCount(r.tasks);
                  return (
                    <PickerItem
                      key={r.studentId}
                      active={activeStudentId === r.studentId}
                      onClick={() => setActiveStudentId(r.studentId)}
                      name={r.studentName}
                      grade={r.grade}
                      badges={
                        pendingFB > 0 ? (
                          <span
                            className="inline-flex h-x5 items-center gap-x0_5 rounded-full bg-bg-warning-weak px-x1_5 t1-bold tabular-nums text-fg-warning"
                            title={`피드백 작성 필요 ${pendingFB}건`}
                          >
                            <MessageSquarePlus className="size-3" aria-hidden />
                            {pendingFB}
                          </span>
                        ) : undefined
                      }
                      description={
                        <>
                          <span className="tabular-nums">총 {r.tasks.length}건</span>
                          {counts.IN_PROGRESS > 0 && (
                            <span className="tabular-nums text-fg-informative">진행 {counts.IN_PROGRESS}</span>
                          )}
                          {counts.SUBMITTED > 0 && (
                            <span className="tabular-nums text-fg-warning">제출 {counts.SUBMITTED}</span>
                          )}
                          {counts.NEEDS_REVISION > 0 && (
                            <span className="tabular-nums text-fg-critical">수정 {counts.NEEDS_REVISION}</span>
                          )}
                          {counts.DONE > 0 && (
                            <span className="tabular-nums text-fg-positive">완료 {counts.DONE}</span>
                          )}
                        </>
                      }
                    />
                  );
                })}
              </ul>
            )}
          </aside>
        }
        detail={
          // 우측: 학생 과제 — 결과물·제출 이력이 각자 카드(Section)라 바깥 카드 없이 평면으로 둔다
          <section aria-label="학생 수행평가" className="min-w-0">
            {!activeRow ? (
              <EmptyState
                icon={ClipboardList}
                title="학생을 선택해 주세요"
                description="왼쪽 목록에서 학생을 고르면 수행평가를 관리할 수 있어요."
              />
            ) : (
              <StudentTasksPanel
                key={activeRow.studentId}
                row={activeRow}
                canManage={canManage}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                now={now}
              />
            )}
          </section>
        }
      />
    </div>
  );
}

// ─────────────── 학생별 과제 패널 ───────────────

function StudentTasksPanel({
  row,
  canManage,
  statusFilter,
  onStatusFilterChange,
  now,
}: {
  row: PerfPanelStudentRow;
  canManage: boolean;
  statusFilter: PerformanceTaskStatus | "ALL";
  onStatusFilterChange: (s: PerformanceTaskStatus | "ALL") => void;
  now: number;
}) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(
    () => {
      // 최초: 피드백 필요한 task 자동 펼침
      const ids = new Set<string>();
      for (const t of row.tasks) {
        if (t.status !== "DONE" && t.submissions[0] && t.submissions[0].feedbacks.length === 0) {
          ids.add(t.id);
        }
      }
      return ids;
    }
  );

  const counts = countTasksByStatus(row.tasks);
  const pendingFB = pendingFeedbackCount(row.tasks);

  const visibleTasks = useMemo(() => {
    if (statusFilter === "ALL") return row.tasks;
    return row.tasks.filter((t) => t.status === statusFilter);
  }, [row.tasks, statusFilter]);

  const toggleExpand = (id: string) => {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-x4">
      {/* 헤더 */}
      <header className="flex flex-col gap-x3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x2">
            <h2 className="t7-bold text-fg-neutral">{row.studentName}</h2>
            <span className="t4-regular text-fg-neutral-subtle">
              {row.grade}
              {row.school ? ` · ${row.school}` : ""}
            </span>
          </div>
          <p className="mt-x1 t3-regular tabular-nums text-fg-neutral-subtle">
            총 {row.tasks.length}건
            {pendingFB > 0 && (
              <span className="t3-medium text-fg-warning"> · 피드백 작성 필요 {pendingFB}건</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-x2">
          <Button asChild variant="outline" size="sm">
            <Link
              href={`/online/students/${row.studentId}/tasks`}
              title="학생 페이지의 수행평가 탭으로 이동"
            >
              <ExternalLink />
              학생 상세
            </Link>
          </Button>
          {canManage && (
            <Button
              size="sm"
              variant={showCreateForm ? "secondary" : "default"}
              onClick={() => setShowCreateForm((v) => !v)}
              aria-expanded={showCreateForm}
            >
              {showCreateForm ? <X /> : <Plus />}
              {showCreateForm ? "등록 닫기" : "새 수행평가"}
            </Button>
          )}
        </div>
      </header>

      {/* 새 수행평가 등록 */}
      {showCreateForm && canManage && (
        <Section title="새 수행평가 등록">
          <CreateTaskInline
            studentId={row.studentId}
            onClose={() => setShowCreateForm(false)}
          />
        </Section>
      )}

      {/* 상태 필터 */}
      <div
        role="group"
        aria-label="상태 필터"
        className="flex gap-x2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <FilterChip
          selected={statusFilter === "ALL"}
          count={row.tasks.length}
          onClick={() => onStatusFilterChange("ALL")}
        >
          전체
        </FilterChip>
        {PERF_STATUS_ORDER.map((s) => (
          <FilterChip
            key={s}
            selected={statusFilter === s}
            count={counts[s]}
            onClick={() => onStatusFilterChange(s)}
            className={cn(counts[s] === 0 && statusFilter !== s && "text-fg-placeholder")}
          >
            {PERF_STATUS_LABEL[s]}
          </FilterChip>
        ))}
      </div>

      {/* 본문 — 과제는 구분선 목록, 펼친 내용(결과물·제출 이력 카드)은 행 아래에 평면으로 */}
      {visibleTasks.length === 0 ? (
        row.tasks.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="등록된 수행평가가 없어요"
            description={canManage ? "과목·제목·마감일을 등록하면 학생 포털에도 보여요." : undefined}
            className="rounded-r4 bg-bg-layer-fill"
            action={
              canManage && !showCreateForm ? (
                <Button onClick={() => setShowCreateForm(true)}>
                  <Plus />
                  새 수행평가
                </Button>
              ) : undefined
            }
          />
        ) : (
          <EmptyState
            compact
            icon={ClipboardList}
            title="선택한 상태의 수행평가가 없어요"
            className="rounded-r4 bg-bg-layer-fill"
            action={
              <Button variant="secondary" size="sm" onClick={() => onStatusFilterChange("ALL")}>
                전체 보기
              </Button>
            }
          />
        )
      ) : (
        <ul className="divide-y divide-stroke-neutral-muted border-y border-stroke-neutral-muted">
          {visibleTasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              expanded={expandedTaskIds.has(t.id)}
              onToggle={() => toggleExpand(t.id)}
              canManage={canManage}
              studentId={row.studentId}
              now={now}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────── 과제 행 (접고/펼치기) ───────────────

function TaskCard({
  task,
  expanded,
  onToggle,
  canManage,
  studentId,
  now,
}: {
  task: PanelTaskRow;
  expanded: boolean;
  onToggle: () => void;
  canManage: boolean;
  studentId: string;
  now: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();

  const latest = task.submissions[0];
  const needsFeedback =
    task.status !== "DONE" && !!latest && latest.feedbacks.length === 0;

  const handleStatusChange = (status: PerformanceTaskStatus) => {
    startTransition(async () => {
      try {
        await updatePerformanceTaskStatus({ taskId: task.id, status });
        toast.success("상태가 변경되었습니다");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "변경 실패");
      }
    });
  };

  const handleDelete = async () => {
    if (
      !(await confirm({
        title: `‘${task.title}’ 수행평가를 삭제할까요?`,
        description: "학생 제출물과 피드백도 함께 삭제되고, 되돌릴 수 없어요.",
        confirmLabel: "삭제",
        destructive: true,
      }))
    )
      return;
    startTransition(async () => {
      try {
        await deletePerformanceTask(task.id);
        toast.success("삭제되었습니다");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "삭제 실패");
      }
    });
  };

  const panelId = `task-panel-${task.id}`;

  return (
    <li>
      <div className="flex flex-wrap items-center gap-x-x3 gap-y-x2 py-x3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="-ml-1 flex min-w-0 flex-1 basis-60 items-center gap-x2 rounded-r2 py-x1 pl-1 text-left"
        >
          <ChevronRight
            className={cn(
              "size-4 shrink-0 text-fg-neutral-subtle transition-transform",
              expanded && "rotate-90"
            )}
            aria-hidden
          />
          <span className="shrink-0 t3-medium text-fg-neutral-subtle">{task.subject}</span>
          <span className="truncate t4-medium text-fg-neutral">{task.title}</span>
          {task.format && (
            <span className="hidden shrink-0 t3-regular text-fg-neutral-subtle md:inline">
              {task.format}
            </span>
          )}
        </button>
        <div className="flex shrink-0 flex-wrap items-center gap-x2 pl-x6 sm:pl-0">
          <DueDate dueIso={task.dueDate} now={now} done={task.status === "DONE"} />
          {needsFeedback && (
            <StatusBadge tone="warn">
              <MessageSquarePlus aria-hidden />
              피드백 필요
            </StatusBadge>
          )}
          {canManage ? (
            <PerfStatusSelect
              value={task.status}
              onChange={handleStatusChange}
              disabled={isPending}
            />
          ) : (
            <PerfStatusBadge status={task.status} />
          )}
          {canManage && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleDelete}
              disabled={isPending}
              aria-label={`${task.title} 삭제`}
              title="삭제"
              className="size-x8 text-fg-neutral-subtle hover:text-fg-critical"
            >
              {isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
            </Button>
          )}
        </div>
      </div>

      {expanded && (
        <div id={panelId} className="flex flex-col gap-x4 pb-x5 sm:pl-x6">
          {task.description && (
            <p className="whitespace-pre-wrap rounded-r3 bg-bg-layer-fill px-x4 py-x3 t4-regular text-fg-neutral-muted">
              {task.description}
            </p>
          )}
          {task.status === "DONE" && (
            <TaskResultEditor
              taskId={task.id}
              initialScore={task.result?.score ?? null}
              initialSummary={task.result?.consultantSummary ?? null}
              initialIncludeInReport={task.result?.includeInReport ?? false}
            />
          )}
          {task.submissions.length === 0 ? (
            <EmptyState
              compact
              icon={ClipboardList}
              title="학생 제출 대기 중"
              description="학생이 포털에서 제출하면 여기서 피드백을 남길 수 있어요."
              className="rounded-r4 bg-bg-layer-fill"
            />
          ) : (
            <TaskSubmissionsThread
              versions={task.submissions}
              taskStatus={task.status}
              canWriteFeedback={canManage}
            />
          )}
          <Link
            href={`/online/students/${studentId}/tasks/${task.id}`}
            className="inline-flex items-center gap-x1 self-end t3-medium text-fg-neutral-subtle underline-offset-2 hover:text-fg-neutral hover:underline"
          >
            전용 페이지로 보기
            <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        </div>
      )}
      {confirmDialog}
    </li>
  );
}

// ─────────────── 새 수행평가 인라인 폼 ───────────────

function CreateTaskInline({
  studentId,
  onClose,
}: {
  studentId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [subject, setSubject] = useState("");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [format, setFormat] = useState("");
  const [scoreWeight, setScoreWeight] = useState("");
  const [description, setDescription] = useState("");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !title || !dueDate) {
      toast.error("과목 · 제목 · 마감일은 필수입니다");
      return;
    }
    startTransition(async () => {
      try {
        await createPerformanceTask({
          studentId,
          subject,
          title,
          dueDate,
          format: format || null,
          scoreWeight: scoreWeight ? Number(scoreWeight) : null,
          description: description || null,
        });
        toast.success("수행평가가 추가되었습니다");
        onClose();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "추가 실패");
      }
    });
  };

  const idp = `perf-new-${studentId}`;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-x4" aria-label="새 수행평가 등록">
      <div className="grid grid-cols-1 gap-x3 md:grid-cols-4">
        <FormField label="과목" required htmlFor={`${idp}-subject`}>
          <Input
            id={`${idp}-subject`}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="예: 국어"
            disabled={isPending}
          />
        </FormField>
        <FormField label="제목" required htmlFor={`${idp}-title`} className="md:col-span-2">
          <Input
            id={`${idp}-title`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 독서 감상문 발표"
            disabled={isPending}
          />
        </FormField>
        <FormField label="마감일" required htmlFor={`${idp}-due`}>
          <Input
            id={`${idp}-due`}
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={isPending}
            className="tabular-nums"
          />
        </FormField>
        <FormField label="형식" htmlFor={`${idp}-format`}>
          <Input
            id={`${idp}-format`}
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            placeholder="예: 발표, 보고서"
            disabled={isPending}
          />
        </FormField>
        <FormField label="배점" htmlFor={`${idp}-weight`}>
          <Input
            id={`${idp}-weight`}
            type="number"
            value={scoreWeight}
            onChange={(e) => setScoreWeight(e.target.value)}
            placeholder="예: 20"
            disabled={isPending}
            className="tabular-nums"
          />
        </FormField>
        <FormField label="메모" htmlFor={`${idp}-desc`} className="md:col-span-2">
          <Input
            id={`${idp}-desc`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="선택 — 학생에게 전달할 안내"
            disabled={isPending}
          />
        </FormField>
      </div>
      <FormActions className="pt-0 max-sm:[&>button]:flex-1">
        <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
          취소
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          {isPending ? "등록 중…" : "등록"}
        </Button>
      </FormActions>
    </form>
  );
}
