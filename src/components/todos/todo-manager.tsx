"use client";

import { useState, useTransition, useEffect, useId } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDraft } from "@/hooks/use-draft";
import {
  Plus, Pencil, Trash2, AlertTriangle, ChevronDown, ChevronUp, History, CheckCircle2, ListTodo,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, inputBaseClass } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EmptyState,
  FilterChip,
  FormActions,
  FormField,
  PageHeader,
  Section,
  Segmented,
  Skeleton,
  StatCard,
  StatCards,
  StatusBadge,
  Toolbar,
  type Tone,
} from "@/components/backoffice/ui";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { CheckMark } from "@/components/handover/handover-ui";
import { createTodo, updateTodo, deleteTodo, toggleTodo, getTodoVersions } from "@/actions/todos";
import { ChecklistManager } from "@/components/handover/checklist-manager";

// ── Types ─────────────────────────────────────────────────────────────────────
type ChecklistTemplate = { id: string; title: string; shiftType: string; days: string; order: number; isActive: boolean };
type Todo = {
  id: string;
  title: string;
  content: string | null;
  dueDate: Date | null;
  priority: string;
  isCompleted: boolean;
  completedAt: Date | null;
  authorId: string;
  authorName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  category: string | null;
  /** "MENTOR" | "STAFF" | "ALL" | null (legacy = ALL 취급) */
  targetRole?: string | null;
  createdAt: Date;
  lastEditorId?: string | null;
  lastEditorName?: string | null;
  lastEditedAt?: Date | null;
};
type TodoVersion = {
  id: string;
  version: number;
  title: string;
  content: string | null;
  dueDate: Date | null;
  priority: string;
  assigneeId: string | null;
  assigneeName: string | null;
  category: string | null;
  editorId: string;
  editorName: string;
  createdAt: Date;
};

function isFullAccessRole(role?: string | null) {
  return role === "DIRECTOR" || role === "ADMIN" || role === "SUPER_ADMIN";
}
function isStaffRole(role?: string | null) {
  return role === "DIRECTOR" || role === "ADMIN" || role === "SUPER_ADMIN" || role === "MENTOR" || role === "STAFF";
}
type Staff = { id: string; name: string; role: string };

interface Props {
  initialTodos: Todo[];
  staffList: Staff[];
  currentUserId: string;
  currentUserName: string;
  currentUserRole?: string;
  initialTemplates?: ChecklistTemplate[];
}

const PRIORITY_LABEL: Record<string, string> = { URGENT: "긴급", HIGH: "높음", NORMAL: "보통", LOW: "낮음" };
const PRIORITY_TONE: Record<string, Tone> = { URGENT: "bad", HIGH: "warn", NORMAL: "info", LOW: "gray" };

function fmtDate(d: Date | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("ko-KR", { month: "short", day: "numeric", weekday: "short" });
}

function isOverdue(d: Date | null, done: boolean) {
  if (!d || done) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return new Date(d) < today;
}

// ── 폼 ────────────────────────────────────────────────────────────────────────
type TodoFormDraft = {
  title: string;
  content: string;
  dueDate: string;
  priority: string;
  assigneeId: string;
  assigneeName: string;
  category: string;
  targetRole: "ALL" | "STAFF" | "MENTOR";
};

const TARGET_ROLE_LABEL: Record<"ALL" | "STAFF" | "MENTOR", string> = {
  ALL: "전체",
  STAFF: "운영조교",
  MENTOR: "멘토",
};
const TARGET_ROLE_TONE: Record<"ALL" | "STAFF" | "MENTOR", Tone> = {
  ALL: "gray",
  STAFF: "info",
  MENTOR: "violet",
};

/**
 * 할 일 등록·수정 폼 — 다이얼로그 안에 넣어 쓴다(제목·닫기는 다이얼로그가 담당).
 * 입력값은 draft 로 localStorage 에 남아, 닫았다 열어도 이어서 쓸 수 있다.
 */
export function TodoForm({
  initial, initialCategory, staffList, onDone, onCancel,
}: {
  initial?: Todo;
  /** 새 할 일 폼에서 카테고리 prefill (예: "루틴 추가" → "루틴") */
  initialCategory?: string;
  staffList: Staff[];
  onDone: (todo: Todo) => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const uid = useId();

  // category prefill 이 있는 새 폼은 별도 draft 키로 일반 새 폼과 분리.
  const draftKey = initial
    ? `todo-form-edit-${initial.id}`
    : initialCategory
      ? `todo-form-new-${initialCategory}`
      : "todo-form-new";
  const initialTargetRole: "ALL" | "STAFF" | "MENTOR" =
    initial?.targetRole === "MENTOR" || initial?.targetRole === "STAFF"
      ? initial.targetRole
      : "ALL";
  const [draft, setDraft, clearDraft] = useDraft<TodoFormDraft>(draftKey, {
    title: initial?.title ?? "",
    content: initial?.content ?? "",
    dueDate: initial?.dueDate ? new Date(initial.dueDate).toISOString().slice(0, 10) : "",
    priority: initial?.priority ?? "NORMAL",
    assigneeId: initial?.assigneeId ?? "",
    assigneeName: initial?.assigneeName ?? "",
    category: initial?.category ?? initialCategory ?? "",
    targetRole: initialTargetRole,
  });

  const { title, content, dueDate, priority, assigneeId, assigneeName, category, targetRole } = draft;
  const setTitle = (v: string) => setDraft((d) => ({ ...d, title: v }));
  const setContent = (v: string) => setDraft((d) => ({ ...d, content: v }));
  const setDueDate = (v: string) => setDraft((d) => ({ ...d, dueDate: v }));
  const setPriority = (v: string) => setDraft((d) => ({ ...d, priority: v }));
  const setCategory = (v: string) => setDraft((d) => ({ ...d, category: v }));
  const setTargetRole = (v: "ALL" | "STAFF" | "MENTOR") => setDraft((d) => ({ ...d, targetRole: v }));

  function handleAssignee(id: string) {
    const staff = staffList.find((s) => s.id === id);
    setDraft((d) => ({ ...d, assigneeId: id, assigneeName: staff?.name ?? "" }));
  }

  function handleSubmit() {
    if (!title.trim()) { toast.error("제목을 입력해주세요"); return; }
    startTransition(async () => {
      try {
        const payload = {
          title,
          content,
          dueDate: dueDate || undefined,
          priority,
          assigneeId: assigneeId || undefined,
          assigneeName: assigneeName || undefined,
          category: category || undefined,
          targetRole,
        };
        let result: Todo;
        if (initial) {
          result = await updateTodo(initial.id, { ...payload, dueDate: dueDate || null }) as unknown as Todo;
        } else {
          result = await createTodo(payload) as unknown as Todo;
        }
        clearDraft();
        onDone(result);
        toast.success(initial ? "수정되었습니다" : "등록되었습니다");
      } catch (err) { toast.error(err instanceof Error ? err.message : "처리 실패"); }
    });
  }

  return (
    <div className="flex flex-col gap-x4">
      {/* 제목 */}
      <FormField label="제목" required htmlFor={`${uid}-title`}>
        <Input
          id={`${uid}-title`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="무엇을 해야 하나요?"
          autoFocus
        />
      </FormField>
      {/* 내용 */}
      <FormField label="상세 내용" htmlFor={`${uid}-content`}>
        <Textarea
          id={`${uid}-content`}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="필요하면 자세히 적어 주세요 (선택)"
          rows={2}
          className="resize-none"
        />
      </FormField>
      {/* 기한 + 담당자 */}
      <div className="grid grid-cols-1 gap-x4 sm:grid-cols-2">
        <FormField label="기한">
          <DatePicker value={dueDate || null} onChange={(d) => setDueDate(d ?? "")} placeholder="날짜 선택" className="w-full" />
        </FormField>
        <FormField label="담당자" htmlFor={`${uid}-assignee`}>
          <select
            id={`${uid}-assignee`}
            value={assigneeId}
            onChange={(e) => handleAssignee(e.target.value)}
            className={cn(inputBaseClass, "h-10")}
          >
            <option value="">없음</option>
            {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </FormField>
      </div>
      {/* 우선순위 */}
      <FormField label="우선순위">
        <Segmented
          aria-label="우선순위"
          value={priority}
          onChange={setPriority}
          options={Object.entries(PRIORITY_LABEL).map(([value, label]) => ({ value, label }))}
        />
      </FormField>
      {/* 대상 역할 (전체 / 운영조교 / 멘토) */}
      <FormField label="대상">
        <Segmented
          aria-label="대상"
          value={targetRole}
          onChange={setTargetRole}
          options={(Object.entries(TARGET_ROLE_LABEL) as ["ALL" | "STAFF" | "MENTOR", string][]).map(([value, label]) => ({ value, label }))}
        />
      </FormField>
      {/* 카테고리 */}
      <FormField label="카테고리" htmlFor={`${uid}-category`}>
        <Input
          id={`${uid}-category`}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="예: 청소, 발주..."
        />
      </FormField>
      {/* 버튼 */}
      <FormActions className="max-sm:[&>*]:flex-1">
        <Button variant="secondary" onClick={onCancel}>취소</Button>
        <Button onClick={handleSubmit} disabled={isPending || !title.trim()}>
          {isPending ? "저장 중…" : initial ? "수정" : "등록"}
        </Button>
      </FormActions>
    </div>
  );
}

// ── 할 일 행 ──────────────────────────────────────────────────────────────────
function TodoRow({
  todo, currentUserId, currentUserRole, isPending,
  onToggle, onEdit, onDelete, onShowHistory,
}: {
  todo: Todo; currentUserId: string; currentUserRole?: string; isPending: boolean;
  onToggle: (id: string) => void; onEdit: (t: Todo) => void; onDelete: (id: string) => void;
  onShowHistory: (t: Todo) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const overdue = isOverdue(todo.dueDate, todo.isCompleted);
  const canEdit = isStaffRole(currentUserRole); // 전체 스태프 편집 가능
  const canDelete = todo.authorId === currentUserId || isFullAccessRole(currentUserRole);
  const wasEdited = !!(todo.lastEditedAt && todo.lastEditorId && todo.lastEditorId !== todo.authorId);
  // 대상 역할 — legacy null 은 "전체" 로 표시
  const tr = todo.targetRole === "MENTOR" || todo.targetRole === "STAFF" ? todo.targetRole : "ALL";

  return (
    <div className="flex items-start gap-x3 px-x5 py-x4">
      <button
        type="button"
        onClick={() => onToggle(todo.id)}
        disabled={isPending}
        aria-pressed={todo.isCompleted}
        aria-label={todo.isCompleted ? `${todo.title} 미완료로 되돌리기` : `${todo.title} 완료로 표시`}
        className="-m-1 grid shrink-0 place-items-center rounded-r2 p-1 transition-colors hover:bg-bg-transparent-pressed disabled:cursor-wait"
      >
        <CheckMark checked={todo.isCompleted} className="mt-0.5" />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x1_5">
          <p className={cn("break-words t4-bold", todo.isCompleted ? "text-fg-neutral-subtle line-through" : "text-fg-neutral")}>
            {todo.title}
          </p>
          {todo.priority !== "NORMAL" && (
            <StatusBadge tone={PRIORITY_TONE[todo.priority] ?? "gray"}>
              {todo.priority === "URGENT" && <AlertTriangle />}
              {PRIORITY_LABEL[todo.priority] ?? todo.priority}
            </StatusBadge>
          )}
          <StatusBadge tone={TARGET_ROLE_TONE[tr]}>{TARGET_ROLE_LABEL[tr]}</StatusBadge>
          {todo.category && <StatusBadge>{todo.category}</StatusBadge>}
        </div>

        {/* 메타 */}
        <div className="mt-x1 flex flex-wrap items-center gap-x-x3 gap-y-x0_5 t3-regular text-fg-neutral-subtle">
          {todo.dueDate && (
            <span className={cn("tabular-nums", overdue && "t3-bold text-fg-critical")}>
              {overdue && "기한 초과 · "}
              {fmtDate(todo.dueDate)}
            </span>
          )}
          {todo.assigneeName && <span>담당 {todo.assigneeName}</span>}
          {todo.authorName && (
            <span className="text-fg-placeholder">
              작성 {todo.authorName}
              {wasEdited && todo.lastEditorName && <> · 수정 {todo.lastEditorName}</>}
            </span>
          )}
        </div>

        {/* 상세 내용 */}
        {expanded && todo.content && (
          <p className="mt-x2 whitespace-pre-wrap rounded-r2 bg-bg-layer-fill px-x3 py-x2 t3-regular text-fg-neutral-muted">
            {todo.content}
          </p>
        )}
      </div>

      {/* 액션 버튼 */}
      <div className="flex shrink-0 items-center">
        {todo.content && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setExpanded((p) => !p)}
            aria-label={expanded ? "상세 내용 접기" : "상세 내용 펼치기"}
            aria-expanded={expanded}
            className="size-8"
          >
            {expanded ? <ChevronUp /> : <ChevronDown />}
          </Button>
        )}
        <Button
          variant="ghost"
          size="xs"
          onClick={() => onShowHistory(todo)}
          title="수정 이력"
          aria-label="수정 이력"
          className="px-x2"
        >
          <History />
          <span className="hidden sm:inline">이력</span>
        </Button>
        {canEdit && (
          <Button variant="ghost" size="icon" onClick={() => onEdit(todo)} aria-label="수정" title="수정" className="size-8">
            <Pencil />
          </Button>
        )}
        {canDelete && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(todo.id)}
            aria-label="삭제"
            title="삭제"
            className="size-8 hover:text-fg-critical"
          >
            <Trash2 />
          </Button>
        )}
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
const ROLE_FILTER_STORAGE_KEY = "todo-role-filter";
type RoleFilter = "ALL" | "STAFF" | "MENTOR";

function isRoleFilter(v: string | null): v is RoleFilter {
  return v === "ALL" || v === "STAFF" || v === "MENTOR";
}

export function TodoManager({ initialTodos, staffList, currentUserId, currentUserRole, initialTemplates }: Props) {
  const [todos, setTodos] = useState<Todo[]>(initialTodos);
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  // 상단 탭: 투두리스트 / 루틴 (?tab=routine 딥링크 지원)
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"todos" | "routine">(
    searchParams.get("tab") === "routine" ? "routine" : "todos"
  );
  // 새 폼의 카테고리 prefill (일반 "새 할 일" → undefined)
  const [formCategory, setFormCategory] = useState<string | undefined>(undefined);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(true);
  const [historyTodo, setHistoryTodo] = useState<Todo | null>(null);
  // 대상 역할 필터 (전체 / 운영 / 멘토). localStorage 영속.
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(ROLE_FILTER_STORAGE_KEY);
      // 마운트 후 브라우저 저장값으로 한 번 맞춘다(SSR 과 첫 렌더를 일치시키기 위해 effect 에서 읽음)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (isRoleFilter(saved)) setRoleFilter(saved);
    } catch { /* ignore */ }
  }, []);
  function changeRoleFilter(next: RoleFilter) {
    setRoleFilter(next);
    try { localStorage.setItem(ROLE_FILTER_STORAGE_KEY, next); } catch { /* ignore */ }
  }

  // 클라이언트 필터: null/legacy 는 항상 매치, ALL 도 항상 매치
  function matchesRole(t: Todo): boolean {
    if (roleFilter === "ALL") return true;
    const tr = t.targetRole;
    if (!tr || tr === "ALL") return true; // legacy/ALL 행은 항상 표시
    return tr === roleFilter;
  }
  const visibleTodos = todos.filter(matchesRole);

  const pending = visibleTodos.filter((t) => !t.isCompleted);
  const completed = visibleTodos.filter((t) => t.isCompleted);
  const overdue = visibleTodos.filter((t) => !t.isCompleted && isOverdue(t.dueDate, false));

  function handleToggle(id: string) {
    startTransition(async () => {
      try {
        await toggleTodo(id);
        setTodos((prev) => prev.map((t) => t.id === id ? { ...t, isCompleted: !t.isCompleted, completedAt: !t.isCompleted ? new Date() : null } : t));
      } catch { toast.error("처리 실패"); }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteTodo(id);
        setTodos((prev) => prev.filter((t) => t.id !== id));
        setDeleteConfirmId(null);
        toast.success("삭제되었습니다");
      } catch (err) { toast.error(err instanceof Error ? err.message : "삭제 실패"); }
    });
  }

  function handleFormDone(todo: Todo) {
    if (editingTodo) {
      setTodos((prev) => prev.map((t) => t.id === todo.id ? todo : t));
      setEditingTodo(null);
    } else {
      setTodos((prev) => [todo, ...prev]);
      setShowForm(false);
      setFormCategory(undefined);
    }
  }

  // 일반 새 할 일 (카테고리 prefill 없음)
  function openNewForm() {
    setEditingTodo(null);
    setFormCategory(undefined);
    setShowForm(true);
  }
  function closeForm() {
    setShowForm(false);
    setEditingTodo(null);
    setFormCategory(undefined);
  }
  function startEdit(t: Todo) {
    setEditingTodo(t);
    setShowForm(false);
    setFormCategory(undefined);
  }

  const isAdmin =
    currentUserRole === "DIRECTOR" ||
    currentUserRole === "SUPER_ADMIN" ||
    currentUserRole === "HEAD_MENTOR";

  const deleteTarget = deleteConfirmId ? todos.find((t) => t.id === deleteConfirmId) : undefined;

  // 할 일 행 렌더 (미완료/완료 공통)
  function renderTodoRow(todo: Todo) {
    return (
      <li key={todo.id}>
        <TodoRow
          todo={todo}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          isPending={isPending}
          onToggle={handleToggle}
          onEdit={startEdit}
          onDelete={setDeleteConfirmId}
          onShowHistory={setHistoryTodo}
        />
      </li>
    );
  }

  const ROLE_FILTERS: { value: RoleFilter; label: string }[] = [
    { value: "ALL", label: "전체" },
    { value: "STAFF", label: "운영" },
    { value: "MENTOR", label: "멘토" },
  ];

  return (
    <div>
      <PageHeader
        title="투두리스트"
        description="직원끼리 할 일을 나누고, 요일별 루틴까지 한곳에서 챙겨요."
        actions={
          tab === "todos" ? (
            <Button onClick={openNewForm}>
              <Plus />
              새 할 일
            </Button>
          ) : undefined
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as "todos" | "routine")}>
        <TabsList aria-label="투두 / 루틴">
          <TabsTrigger value="todos">
            투두리스트
            {pending.length > 0 && <span className="t4-bold tabular-nums text-fg-brand">{pending.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="routine">루틴</TabsTrigger>
        </TabsList>

        {/* ── 투두리스트 탭 ── */}
        <TabsContent value="todos" className="flex min-w-0 flex-col gap-x6">
          {/* 요약 */}
          <StatCards cols={3}>
            <StatCard label="기한 초과" value={overdue.length} unit="개" tone={overdue.length > 0 ? "bad" : "gray"} />
            <StatCard label="진행 중" value={pending.length} unit="개" />
            <StatCard label="완료" value={completed.length} unit="개" className="col-span-2 lg:col-span-1" />
          </StatCards>

          <div className="flex flex-col gap-x4">
            {/* 대상 역할 필터 */}
            <Toolbar className="mb-0">
              <span className="mr-x1 t3-medium text-fg-neutral-subtle">대상</span>
              {ROLE_FILTERS.map((r) => (
                <FilterChip key={r.value} selected={roleFilter === r.value} onClick={() => changeRoleFilter(r.value)}>
                  {r.label}
                </FilterChip>
              ))}
            </Toolbar>

            {/* 진행 중 (미완료) 목록 */}
            <Section title="진행 중" count={pending.length} flush>
              {pending.length === 0 ? (
                <EmptyState
                  icon={todos.length === 0 ? ListTodo : CheckCircle2}
                  title={todos.length === 0 ? "아직 등록된 할 일이 없어요" : "모든 할 일을 끝냈어요"}
                  description={todos.length === 0 ? "함께 챙길 일을 등록하면 담당자와 기한까지 관리할 수 있어요" : undefined}
                  action={
                    <Button variant="secondary" onClick={openNewForm}>
                      <Plus />
                      새 할 일
                    </Button>
                  }
                  className="border-t border-stroke-neutral-muted"
                />
              ) : (
                <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
                  {pending.map(renderTodoRow)}
                </ul>
              )}
            </Section>

            {/* 완료 목록 (접을 수 있음) */}
            {completed.length > 0 && (
              <Section
                title="완료"
                count={completed.length}
                actions={
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setShowCompleted((p) => !p)}
                    aria-expanded={showCompleted}
                  >
                    {showCompleted ? <ChevronUp /> : <ChevronDown />}
                    {showCompleted ? "접기" : "펼치기"}
                  </Button>
                }
                flush
              >
                {showCompleted && (
                  <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
                    {completed.map(renderTodoRow)}
                  </ul>
                )}
              </Section>
            )}
          </div>
        </TabsContent>

        {/* ── 루틴 탭 ── */}
        <TabsContent value="routine" className="min-w-0">
          {initialTemplates !== undefined ? (
            <ChecklistManager initialTemplates={initialTemplates} editable={isAdmin} />
          ) : (
            <Section>
              <EmptyState compact icon={ListTodo} title="루틴 데이터를 불러올 수 없어요" description="잠시 후 새로고침해 주세요" />
            </Section>
          )}
        </TabsContent>
      </Tabs>

      {/* 폼 (추가 or 수정) */}
      <Dialog open={showForm || !!editingTodo} onOpenChange={(o) => { if (!o) closeForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="t7-bold">{editingTodo ? "할 일 수정" : "새 할 일"}</DialogTitle>
            <DialogDescription>
              {editingTodo ? "바뀐 내용은 수정 이력에 남아요" : "담당자와 기한을 정해 두면 놓치지 않아요"}
            </DialogDescription>
          </DialogHeader>
          {(showForm || editingTodo) && (
            <TodoForm
              key={editingTodo?.id ?? "new"}
              initial={editingTodo ?? undefined}
              initialCategory={editingTodo ? undefined : formCategory}
              staffList={staffList}
              onDone={handleFormDone}
              onCancel={closeForm}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirmId != null}
        onOpenChange={(o) => { if (!o) setDeleteConfirmId(null); }}
        title="이 할 일을 삭제할까요?"
        description={deleteTarget ? `"${deleteTarget.title}" — 삭제하면 되돌릴 수 없어요.` : "삭제하면 되돌릴 수 없어요."}
        pendingLabel="삭제하는 중…"
        pending={isPending}
        onConfirm={() => { if (deleteConfirmId) handleDelete(deleteConfirmId); }}
      />

      {historyTodo && (
        <VersionsDialog todo={historyTodo} onClose={() => setHistoryTodo(null)} />
      )}
    </div>
  );
}

// ── 수정 이력 다이얼로그 ──────────────────────────────────────────────────────
function fmtDateTime(d: Date | string) {
  return new Date(d).toLocaleString("ko-KR", {
    year: "numeric", month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function VersionMeta({ dueDate, priority, assigneeName, category }: { dueDate: Date | null; priority: string; assigneeName: string | null; category: string | null }) {
  return (
    <div className="mt-x1_5 flex flex-wrap gap-x-x2 gap-y-x0_5 t2-regular text-fg-neutral-subtle">
      {dueDate && <span className="tabular-nums">기한 {new Date(dueDate).toLocaleDateString("ko-KR")}</span>}
      <span>우선 {PRIORITY_LABEL[priority] ?? priority}</span>
      {assigneeName && <span>담당 {assigneeName}</span>}
      {category && <span>분류 {category}</span>}
    </div>
  );
}

function VersionsDialog({ todo, onClose }: { todo: Todo; onClose: () => void }) {
  const [versions, setVersions] = useState<TodoVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getTodoVersions(todo.id)
      .then((rows) => { if (!cancelled) setVersions(rows as unknown as TodoVersion[]); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "이력을 불러오지 못했습니다"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [todo.id]);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="t7-bold">수정 이력</DialogTitle>
          <DialogDescription className="truncate">{todo.title}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          {loading && (
            <div className="flex flex-col gap-x2" aria-busy="true" aria-label="불러오는 중">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}
          {error && <p className="py-x6 text-center t4-regular text-fg-critical">{error}</p>}
          {versions && (
            <ol className="flex flex-col gap-x2">
              {/* 현재 상태 (라이브) */}
              <li className="rounded-r3 bg-bg-positive-weak p-x4">
                <div className="mb-x1_5 flex items-center gap-x2">
                  <StatusBadge tone="ok" solid>현재</StatusBadge>
                  <span className="t3-bold text-fg-neutral">
                    {todo.lastEditorName ?? todo.authorName}
                  </span>
                  <span className="ml-auto t3-regular tabular-nums text-fg-neutral-subtle">
                    {fmtDateTime(todo.lastEditedAt ?? todo.createdAt)}
                  </span>
                </div>
                <p className="t4-medium text-fg-neutral">{todo.title}</p>
                {todo.content && (
                  <p className="mt-x0_5 line-clamp-4 whitespace-pre-wrap t3-regular text-fg-neutral-muted">{todo.content}</p>
                )}
                <VersionMeta dueDate={todo.dueDate} priority={todo.priority} assigneeName={todo.assigneeName} category={todo.category} />
              </li>

              {/* 과거 버전들 */}
              {versions.map((v, idx) => {
                const isOriginal = v.version === 1;
                const newer = versions[idx - 1];
                return (
                  <li key={v.id} className="rounded-r3 bg-bg-layer-fill p-x4">
                    <div className="mb-x1_5 flex items-center gap-x2">
                      <StatusBadge tone={isOriginal ? "brand" : "gray"}>
                        v{v.version}{isOriginal && " · 최초"}
                      </StatusBadge>
                      <span className="t3-bold text-fg-neutral">{v.editorName}</span>
                      <span className="ml-auto t3-regular tabular-nums text-fg-neutral-subtle">
                        {fmtDateTime(v.createdAt)}
                      </span>
                    </div>
                    <p className="t4-medium text-fg-neutral">{v.title}</p>
                    {v.content && (
                      <p className="mt-x0_5 line-clamp-4 whitespace-pre-wrap t3-regular text-fg-neutral-muted">{v.content}</p>
                    )}
                    <VersionMeta dueDate={v.dueDate} priority={v.priority} assigneeName={v.assigneeName} category={v.category} />
                    {newer && (
                      <div className="mt-x2 border-t border-stroke-neutral-muted pt-x2 t2-regular text-fg-neutral-subtle">
                        변경: {diffSummary(v, newer)}
                      </div>
                    )}
                  </li>
                );
              })}
              {versions.length === 0 && (
                <li className="py-x2 text-center t3-regular text-fg-neutral-subtle">
                  과거 수정 이력이 없어요
                </li>
              )}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function diffSummary(prev: TodoVersion, next: TodoVersion): string {
  const parts: string[] = [];
  if (prev.title !== next.title) parts.push("제목");
  if ((prev.content ?? "") !== (next.content ?? "")) parts.push("내용");
  if (String(prev.dueDate ?? "") !== String(next.dueDate ?? "")) parts.push("기한");
  if (prev.priority !== next.priority) parts.push("우선순위");
  if ((prev.assigneeId ?? "") !== (next.assigneeId ?? "")) parts.push("담당자");
  if ((prev.category ?? "") !== (next.category ?? "")) parts.push("분류");
  return parts.length ? parts.join(", ") : "메타 정보";
}
