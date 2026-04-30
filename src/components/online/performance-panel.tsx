"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  ClipboardList,
  MessageSquarePlus,
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

const STATUS_ORDER: PerformanceTaskStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "SUBMITTED",
  "NEEDS_REVISION",
  "DONE",
];

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

  const filterOptions = useMemo(() => deriveFilterOptions(rows), [rows]);

  const filteredRows = useMemo(
    () => rows.filter((r) => matchesStudentFilter(r, filter)),
    [rows, filter]
  );

  const activeRow = useMemo(
    () => rows.find((r) => r.studentId === activeStudentId) ?? null,
    [rows, activeStudentId]
  );

  return (
    <div className="space-y-3">
      <StudentFilterBar
        value={filter}
        onChange={setFilter}
        availableGrades={filterOptions.grades}
        availableSchools={filterOptions.schools}
        hasUnknownSchool={filterOptions.hasUnknownSchool}
        rightSlot={
          <span className="text-[11px] text-ink-5 tabular-nums">
            {filteredRows.length} / {rows.length}명
          </span>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-3 min-h-[600px]">
        {/* 좌측: 학생 리스트 */}
        <aside className="border border-line rounded-lg bg-panel overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-line text-[11px] text-ink-5 flex items-center justify-between">
            <span>학생을 선택하세요</span>
            <span className="tabular-nums">총 {filteredRows.length}명</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-line max-h-[680px]">
            {filteredRows.length === 0 ? (
              <p className="p-4 text-center text-xs text-ink-5">
                조건에 맞는 학생이 없습니다
              </p>
            ) : (
              filteredRows.map((r) => {
                const isActive = activeStudentId === r.studentId;
                const counts = countTasksByStatus(r.tasks);
                const pendingFB = pendingFeedbackCount(r.tasks);
                return (
                  <button
                    type="button"
                    key={r.studentId}
                    onClick={() => setActiveStudentId(r.studentId)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 border-l-2 transition-colors block",
                      isActive
                        ? "bg-primary/5 border-primary"
                        : "hover:bg-canvas-2/40 border-transparent"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[13px] text-ink truncate">
                        {r.studentName}
                      </span>
                      <span className="text-[10.5px] text-ink-5">
                        {r.grade}
                      </span>
                      {pendingFB > 0 && (
                        <span
                          className="ml-auto inline-flex items-center gap-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-px text-[10px] font-bold"
                          title={`피드백 작성 필요 ${pendingFB}건`}
                        >
                          <MessageSquarePlus className="h-2.5 w-2.5" />
                          {pendingFB}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[10.5px] text-ink-5 flex items-center gap-2 flex-wrap">
                      <span>총 {r.tasks.length}건</span>
                      {counts.IN_PROGRESS > 0 && (
                        <span className="text-blue-700">진행 {counts.IN_PROGRESS}</span>
                      )}
                      {counts.SUBMITTED > 0 && (
                        <span className="text-amber-700">제출 {counts.SUBMITTED}</span>
                      )}
                      {counts.NEEDS_REVISION > 0 && (
                        <span className="text-red-700">수정 {counts.NEEDS_REVISION}</span>
                      )}
                      {counts.DONE > 0 && (
                        <span className="text-emerald-700">완료 {counts.DONE}</span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* 우측: 학생 과제 패널 */}
        <main className="border border-line rounded-lg bg-panel flex flex-col min-h-[600px]">
          {!activeRow ? (
            <div className="flex-1 flex items-center justify-center text-sm text-ink-5">
              좌측에서 학생을 선택하세요
            </div>
          ) : (
            <StudentTasksPanel
              row={activeRow}
              canManage={canManage}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
            />
          )}
        </main>
      </div>
    </div>
  );
}

// ─────────────── 학생별 과제 패널 ───────────────

function StudentTasksPanel({
  row,
  canManage,
  statusFilter,
  onStatusFilterChange,
}: {
  row: PerfPanelStudentRow;
  canManage: boolean;
  statusFilter: PerformanceTaskStatus | "ALL";
  onStatusFilterChange: (s: PerformanceTaskStatus | "ALL") => void;
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
    <>
      {/* 헤더 */}
      <div className="px-5 py-3 border-b border-line flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-base text-ink">{row.studentName}</h3>
            <span className="text-xs text-ink-5">{row.grade}</span>
            {row.school && (
              <span className="text-xs text-ink-5">· {row.school}</span>
            )}
          </div>
          <p className="text-[11px] text-ink-5 mt-0.5">
            총 {row.tasks.length}건
            {pendingFB > 0 && (
              <span className="ml-1.5 text-amber-700 font-medium">
                · 피드백 작성 필요 {pendingFB}건
              </span>
            )}
          </p>
        </div>
        <Link
          href={`/online/students/${row.studentId}/tasks`}
          className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11.5px] text-ink-3 hover:text-ink hover:border-line-strong"
          title="학생 페이지의 수행평가 탭으로 이동"
        >
          <ExternalLink className="h-3 w-3" />
          학생 상세
        </Link>
      </div>

      {/* 상태 필터 + 추가 버튼 */}
      <div className="px-5 pt-3 pb-2 flex items-center gap-2 flex-wrap">
        <div className="flex flex-wrap gap-1">
          <FilterChip
            label={`전체 ${row.tasks.length}`}
            active={statusFilter === "ALL"}
            onClick={() => onStatusFilterChange("ALL")}
          />
          {STATUS_ORDER.map((s) => (
            <FilterChip
              key={s}
              label={`${STATUS_LABEL[s]} ${counts[s]}`}
              active={statusFilter === s}
              onClick={() => onStatusFilterChange(s)}
              dim={counts[s] === 0}
            />
          ))}
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowCreateForm((v) => !v)}
            className="ml-auto inline-flex items-center gap-1 rounded-[8px] bg-ink text-white px-2.5 py-1 text-[12px] font-semibold hover:bg-ink/90"
          >
            <Plus className="h-3 w-3" />
            새 수행평가
          </button>
        )}
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto px-5 pb-5 pt-1 space-y-3">
        {showCreateForm && canManage && (
          <CreateTaskInline
            studentId={row.studentId}
            onClose={() => setShowCreateForm(false)}
          />
        )}

        {visibleTasks.length === 0 ? (
          <div className="rounded-[10px] border border-dashed border-line bg-canvas-2/50 p-6 text-center text-[12.5px] text-ink-5">
            {row.tasks.length === 0
              ? "등록된 수행평가가 없습니다. 위 “새 수행평가” 버튼을 눌러 추가하세요."
              : "선택한 상태에 해당하는 수행평가가 없습니다."}
          </div>
        ) : (
          visibleTasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              expanded={expandedTaskIds.has(t.id)}
              onToggle={() => toggleExpand(t.id)}
              canManage={canManage}
              studentId={row.studentId}
            />
          ))
        )}
      </div>
    </>
  );
}

// ─────────────── 과제 카드 (접고/펼치기) ───────────────

function TaskCard({
  task,
  expanded,
  onToggle,
  canManage,
  studentId,
}: {
  task: PanelTaskRow;
  expanded: boolean;
  onToggle: () => void;
  canManage: boolean;
  studentId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const due = new Date(task.dueDate);
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

  const handleDelete = () => {
    if (!confirm(`"${task.title}" 수행평가를 삭제합니다. 제출물도 함께 삭제됩니다.`)) return;
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

  return (
    <article
      className={cn(
        "rounded-[12px] border bg-canvas overflow-hidden transition-colors",
        needsFeedback ? "border-amber-300" : "border-line"
      )}
    >
      <header className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="grid place-items-center w-6 h-6 rounded hover:bg-canvas-2 text-ink-4 hover:text-ink shrink-0"
          aria-label={expanded ? "접기" : "펼치기"}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          <span className="text-[11px] text-ink-5 shrink-0">{task.subject}</span>
          <span className="text-[12.5px] font-medium text-ink truncate">
            {task.title}
          </span>
          {task.format && (
            <span className="text-[10.5px] text-ink-5 shrink-0 hidden md:inline">
              ({task.format})
            </span>
          )}
        </button>
        <span className={`text-[11.5px] tabular-nums shrink-0 ${dueClass}`}>
          {due.toLocaleDateString("ko-KR")}
          <span className="ml-0.5 text-[10px]">
            {daysLeft < 0
              ? `D+${-daysLeft}`
              : daysLeft === 0
                ? "D-Day"
                : `D-${daysLeft}`}
          </span>
        </span>
        {needsFeedback && (
          <span
            className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-px text-[10px] font-bold shrink-0"
            title="피드백 작성 필요"
          >
            <MessageSquarePlus className="h-2.5 w-2.5" />
            FB
          </span>
        )}
        {canManage ? (
          <select
            value={task.status}
            onChange={(e) =>
              handleStatusChange(e.target.value as PerformanceTaskStatus)
            }
            disabled={isPending}
            onClick={(e) => e.stopPropagation()}
            className={`rounded-[6px] border border-line px-1.5 py-0.5 text-[11px] font-medium shrink-0 ${STATUS_COLORS[task.status]}`}
          >
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        ) : (
          <span
            className={`inline-block rounded-[6px] px-1.5 py-0.5 text-[11px] font-medium shrink-0 ${STATUS_COLORS[task.status]}`}
          >
            {STATUS_LABEL[task.status]}
          </span>
        )}
        {canManage && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            title="삭제"
            className="p-1 rounded-[6px] text-red-500 hover:text-red-700 hover:bg-red-50 disabled:opacity-50 shrink-0"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </header>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-line space-y-3">
          {task.description && (
            <p className="text-[12px] text-ink-3 whitespace-pre-wrap leading-relaxed bg-canvas-2/40 rounded-md px-3 py-2">
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
            <div className="rounded-[10px] border border-dashed border-line bg-canvas-2/50 p-4 text-center text-[12px] text-ink-5">
              <ClipboardList className="h-4 w-4 mx-auto mb-1 text-ink-5" />
              학생 제출 대기 중
            </div>
          ) : (
            <TaskSubmissionsThread
              versions={task.submissions}
              taskStatus={task.status}
              canWriteFeedback={canManage}
            />
          )}
          <p className="text-[10.5px] text-ink-5 text-right">
            <Link
              href={`/online/students/${studentId}/tasks/${task.id}`}
              className="hover:text-ink underline-offset-2 hover:underline inline-flex items-center gap-0.5"
            >
              전용 페이지로 보기 <ExternalLink className="h-2.5 w-2.5" />
            </Link>
          </p>
        </div>
      )}
    </article>
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

  const inputClass =
    "w-full rounded-[8px] border border-line bg-canvas px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:border-line-strong disabled:opacity-50";

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-[12px] border-2 border-ink/10 bg-panel p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-ink">새 수행평가 등록</h3>
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="text-[11px] text-ink-5 hover:text-ink"
        >
          닫기
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <Field label="과목" required>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="예: 국어"
            className={inputClass}
            disabled={isPending}
          />
        </Field>
        <Field label="제목" required className="md:col-span-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 독서 감상문 발표"
            className={inputClass}
            disabled={isPending}
          />
        </Field>
        <Field label="마감일" required>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={inputClass}
            disabled={isPending}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <Field label="형식">
          <input
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            placeholder="예: 발표, 보고서"
            className={inputClass}
            disabled={isPending}
          />
        </Field>
        <Field label="배점">
          <input
            type="number"
            value={scoreWeight}
            onChange={(e) => setScoreWeight(e.target.value)}
            placeholder="예: 20"
            className={inputClass}
            disabled={isPending}
          />
        </Field>
        <Field label="메모" className="md:col-span-2">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="선택 — 학생에게 전달할 안내"
            className={inputClass}
            disabled={isPending}
          />
        </Field>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="rounded-[8px] border border-line bg-panel px-3 py-1.5 text-[12.5px] text-ink-3"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-1 rounded-[8px] bg-ink text-white px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50"
        >
          {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          등록
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-[11px] text-ink-4">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  dim,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  dim?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors border",
        active
          ? "bg-ink text-white border-ink"
          : dim
            ? "bg-panel border-line text-ink-5 hover:text-ink-3"
            : "bg-panel border-line text-ink-3 hover:text-ink hover:border-line-strong"
      )}
    >
      {label}
    </button>
  );
}
