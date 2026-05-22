"use client";

import { useState, useTransition, useEffect } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDraft } from "@/hooks/use-draft";
import {
  Plus, CheckSquare, Square, Pencil, Trash2, AlertTriangle,
  Calendar, User, ChevronDown, ChevronUp, X, Check, Settings2, History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { createTodo, updateTodo, deleteTodo, toggleTodo, getTodoVersions } from "@/actions/todos";
import { ChecklistManager } from "@/components/handover/checklist-manager";

// ── Types ─────────────────────────────────────────────────────────────────────
type ChecklistTemplate = { id: string; title: string; shiftType: string; order: number; isActive: boolean };
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
const PRIORITY_COLOR: Record<string, string> = {
  URGENT: "bg-red-100 text-red-700 border-red-200",
  HIGH: "bg-orange-100 text-orange-700 border-orange-200",
  NORMAL: "bg-blue-50 text-blue-700 border-blue-200",
  LOW: "bg-gray-50 text-gray-500 border-gray-200",
};

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

function TodoForm({
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
  const setAssigneeId = (v: string) => setDraft((d) => ({ ...d, assigneeId: v }));
  const setAssigneeName = (v: string) => setDraft((d) => ({ ...d, assigneeName: v }));
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
    <div className="space-y-3 p-4 rounded-xl border bg-card">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-semibold">{initial ? "할 일 수정" : "새 할 일"}</span>
        <button onClick={onCancel} className="ml-auto p-1 rounded hover:bg-muted text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
      </div>
      {/* 제목 */}
      <input
        value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder="제목 *"
        className="w-full text-sm border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
      />
      {/* 내용 */}
      <textarea
        value={content} onChange={(e) => setContent(e.target.value)}
        placeholder="상세 내용 (선택)"
        rows={2}
        className="w-full text-sm border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none"
      />
      {/* 2-col: 기한 + 우선순위 */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-muted-foreground mb-1 block">기한</label>
          <DatePicker value={dueDate || null} onChange={(d) => setDueDate(d ?? "")} placeholder="날짜 선택" />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground mb-1 block">우선순위</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}
            className="w-full text-sm border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary/30">
            {Object.entries(PRIORITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>
      {/* 담당자 + 카테고리 */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-muted-foreground mb-1 block">담당자</label>
          <select value={assigneeId} onChange={(e) => handleAssignee(e.target.value)}
            className="w-full text-sm border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary/30">
            <option value="">없음</option>
            {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground mb-1 block">카테고리</label>
          <input
            value={category} onChange={(e) => setCategory(e.target.value)}
            placeholder="예: 청소, 발주..."
            className="w-full text-sm border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
      </div>
      {/* 대상 역할 (전체 / 운영조교 / 멘토) */}
      <div>
        <label className="text-[11px] text-muted-foreground mb-1 block">대상</label>
        <select
          value={targetRole}
          onChange={(e) => setTargetRole(e.target.value as "ALL" | "STAFF" | "MENTOR")}
          className="w-full text-sm border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
        >
          {(Object.entries(TARGET_ROLE_LABEL) as ["ALL" | "STAFF" | "MENTOR", string][]).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>
      {/* 버튼 */}
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={handleSubmit} disabled={isPending || !title.trim()} className="flex-1 h-8 text-xs gap-1">
          <Check className="h-3.5 w-3.5" />{initial ? "수정" : "등록"}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} className="h-8 text-xs">취소</Button>
      </div>
    </div>
  );
}

// ── 할 일 카드 ────────────────────────────────────────────────────────────────
function TodoCard({
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

  return (
    <div className={cn(
      "rounded-xl border bg-card transition-all",
      todo.priority === "URGENT" ? "border-red-200" : "",
      overdue ? "border-orange-300 bg-orange-50/20" : "",
    )}>
      <div className="p-3">
        {/* Top row */}
        <div className="flex items-start gap-2">
          <button
            onClick={() => onToggle(todo.id)}
            disabled={isPending}
            className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors"
          >
            {todo.isCompleted
              ? <CheckSquare className="h-4 w-4 text-green-500" />
              : <Square className="h-4 w-4 text-muted-foreground/50" />
            }
          </button>
          <div className="flex-1 min-w-0">
            {/* 뱃지 */}
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              {todo.priority !== "NORMAL" && (
                <span className={cn("text-[10px] font-semibold border rounded-full px-1.5 py-0.5", PRIORITY_COLOR[todo.priority])}>
                  {todo.priority === "URGENT" && <AlertTriangle className="h-2.5 w-2.5 inline mr-0.5" />}
                  {PRIORITY_LABEL[todo.priority]}
                </span>
              )}
              {/* 대상 역할 chip — legacy null 은 "전체" 로 표시 */}
              {(() => {
                const tr = todo.targetRole === "MENTOR" || todo.targetRole === "STAFF" ? todo.targetRole : "ALL";
                const colorClass =
                  tr === "MENTOR" ? "bg-purple-50 text-purple-700 border-purple-200"
                  : tr === "STAFF" ? "bg-sky-50 text-sky-700 border-sky-200"
                  : "bg-muted border-border text-muted-foreground";
                return (
                  <span className={cn("text-[10px] border rounded-full px-2 py-0.5", colorClass)}>
                    {TARGET_ROLE_LABEL[tr]}
                  </span>
                );
              })()}
              {todo.category && <span className="text-[10px] bg-muted border rounded-full px-2 py-0.5 text-muted-foreground">{todo.category}</span>}
            </div>
            <p className={cn("text-sm font-medium", todo.isCompleted && "line-through text-muted-foreground")}>{todo.title}</p>
            {/* 메타 */}
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {todo.dueDate && (
                <span className={cn("text-[11px] flex items-center gap-0.5", overdue ? "text-red-600 font-semibold" : "text-muted-foreground")}>
                  <Calendar className="h-2.5 w-2.5" />
                  {overdue && "기한 초과 · "}
                  {fmtDate(todo.dueDate)}
                </span>
              )}
              {todo.assigneeName && (
                <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                  <User className="h-2.5 w-2.5" />{todo.assigneeName}
                </span>
              )}
              {todo.authorName && (
                <span className="text-[10px] text-muted-foreground/60 ml-auto">
                  {todo.authorName}
                  {wasEdited && todo.lastEditorName && (
                    <> · 수정 {todo.lastEditorName}</>
                  )}
                </span>
              )}
            </div>
          </div>
          {/* 액션 버튼 */}
          <div className="flex items-center gap-0.5 shrink-0">
            {(todo.content) && (
              <button onClick={() => setExpanded((p) => !p)} className="p-1 rounded hover:bg-muted text-muted-foreground">
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            )}
            <button
              onClick={() => onShowHistory(todo)}
              title="수정 이력"
              className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            >
              <History className="h-3 w-3" />
              <span className="text-[11px] leading-none">이력</span>
            </button>
            {canEdit && (
              <button onClick={() => onEdit(todo)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                <Pencil className="h-3 w-3" />
              </button>
            )}
            {canDelete && (
              <button onClick={() => onDelete(todo.id)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600">
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
        {/* 상세 내용 */}
        {expanded && todo.content && (
          <div className="mt-2 ml-6 text-xs text-muted-foreground whitespace-pre-wrap bg-muted/30 rounded-lg px-3 py-2">
            {todo.content}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
const ROLE_FILTER_STORAGE_KEY = "todo-role-filter";
const ROUTINE_CATEGORY = "루틴";
type RoleFilter = "ALL" | "STAFF" | "MENTOR";

function isRoleFilter(v: string | null): v is RoleFilter {
  return v === "ALL" || v === "STAFF" || v === "MENTOR";
}

export function TodoManager({ initialTodos, staffList, currentUserId, currentUserName, currentUserRole, initialTemplates }: Props) {
  const [todos, setTodos] = useState<Todo[]>(initialTodos);
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  // 새 폼의 카테고리 prefill ("루틴 추가" → "루틴", 일반 "새 할 일" → undefined)
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

  // 루틴 섹션 분리 — category === "루틴" 정확 매칭 (운영 컨벤션)
  const routineTodos = visibleTodos.filter((t) => t.category === ROUTINE_CATEGORY);
  const regularTodos = visibleTodos.filter((t) => t.category !== ROUTINE_CATEGORY);

  const pending = regularTodos.filter((t) => !t.isCompleted);
  const completed = regularTodos.filter((t) => t.isCompleted);
  // KPI 는 루틴 포함 전체 가시 todos 기준 (운영자 시야).
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
  // 루틴 추가 (category="루틴" prefill)
  function openRoutineForm() {
    setEditingTodo(null);
    setFormCategory(ROUTINE_CATEGORY);
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

  // 삭제 확인 카드 또는 일반 TodoCard 렌더 (루틴/미완료/완료 공통)
  function renderTodoRow(todo: Todo) {
    if (deleteConfirmId === todo.id) {
      return (
        <div key={todo.id} className="rounded-xl border border-red-200 bg-red-50/60 p-3 flex items-center justify-between gap-2">
          <p className="text-sm text-red-700">삭제하시겠습니까?</p>
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" onClick={() => handleDelete(todo.id)} disabled={isPending} className="h-7 text-xs">삭제</Button>
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(null)} className="h-7 text-xs">취소</Button>
          </div>
        </div>
      );
    }
    return (
      <TodoCard
        key={todo.id}
        todo={todo}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        isPending={isPending}
        onToggle={handleToggle}
        onEdit={startEdit}
        onDelete={setDeleteConfirmId}
        onShowHistory={setHistoryTodo}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4 items-start">
      {/* ── 좌: 루틴 사이드바 ─────────────────────────────────────────── */}
      <aside className="lg:sticky lg:top-4 space-y-3">
        <section
          aria-label="루틴 할 일"
          className="rounded-xl border bg-amber-50/40 border-amber-200/70 overflow-hidden"
        >
          {/* 헤더 "루틴 (N)" */}
          <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-amber-200/60">
            <span className="text-sm font-semibold text-amber-900">루틴</span>
            <span className="text-[11px] font-normal text-amber-700/80">{routineTodos.length}개</span>
          </div>

          {/* 루틴 리스트 / 빈 상태 */}
          <div className="p-2 space-y-2">
            {routineTodos.length === 0 ? (
              <div className="text-center py-6 px-2 text-amber-800/70">
                <p className="text-xs">등록된 루틴이 없습니다</p>
              </div>
            ) : (
              routineTodos.map(renderTodoRow)
            )}

            {/* + 루틴 추가 */}
            <Button
              variant="outline"
              size="sm"
              onClick={openRoutineForm}
              className="w-full h-8 text-xs gap-1 border-amber-300/70 bg-amber-50/60 text-amber-900 hover:bg-amber-100/60"
            >
              <Plus className="h-3.5 w-3.5" />루틴 추가
            </Button>
          </div>

          {/* 루틴 관리 (관리자 전용 — Sheet) */}
          {initialTemplates !== undefined && (
            <div className="border-t border-amber-200/60 p-2">
              {isAdmin ? (
                <Sheet>
                  <SheetTrigger asChild>
                    <button
                      type="button"
                      className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium text-amber-900/80 hover:bg-amber-100/60 transition-colors"
                    >
                      <Settings2 className="h-3.5 w-3.5" />루틴 관리
                    </button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
                    <SheetHeader>
                      <SheetTitle>루틴 관리</SheetTitle>
                    </SheetHeader>
                    <div className="mt-4">
                      <ChecklistManager initialTemplates={initialTemplates} />
                    </div>
                  </SheetContent>
                </Sheet>
              ) : (
                <p className="text-[11px] text-amber-800/60 text-center py-1">
                  루틴 관리는 관리자·총괄멘토만 가능합니다.
                </p>
              )}
            </div>
          )}
        </section>
      </aside>

      {/* ── 우: 할 일 메인 ────────────────────────────────────────────── */}
      <div className="space-y-4 min-w-0">
        {/* 헤더 + 새 할 일 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">투두리스트</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              미완료 {pending.length}개 · 완료 {completed.length}개
              {overdue.length > 0 && <span className="text-red-600 font-semibold ml-2">· 기한 초과 {overdue.length}개</span>}
            </p>
          </div>
          <Button size="sm" onClick={openNewForm} className="gap-1.5 h-8">
            <Plus className="h-3.5 w-3.5" />새 할 일
          </Button>
        </div>

        {/* KPI chips */}
        <div className="grid grid-cols-3 gap-2">
          <div className={cn("rounded-xl border px-3 py-2.5 flex items-center gap-2", overdue.length > 0 ? "bg-red-50 border-red-200 text-red-700" : "bg-muted border-border text-muted-foreground")}>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <div><p className="text-lg font-bold leading-none">{overdue.length}</p><p className="text-[10px] mt-0.5 opacity-70">기한 초과</p></div>
          </div>
          <div className="rounded-xl border bg-blue-50 border-blue-200 text-blue-700 px-3 py-2.5 flex items-center gap-2">
            <Square className="h-3.5 w-3.5 shrink-0" />
            <div><p className="text-lg font-bold leading-none">{pending.length}</p><p className="text-[10px] mt-0.5 opacity-70">진행 중</p></div>
          </div>
          <div className="rounded-xl border bg-green-50 border-green-200 text-green-700 px-3 py-2.5 flex items-center gap-2">
            <CheckSquare className="h-3.5 w-3.5 shrink-0" />
            <div><p className="text-lg font-bold leading-none">{completed.length}</p><p className="text-[10px] mt-0.5 opacity-70">완료</p></div>
          </div>
        </div>

        {/* 대상 역할 필터 pill */}
        <div className="flex items-center gap-1.5" role="tablist" aria-label="대상 역할 필터">
          {(["ALL", "STAFF", "MENTOR"] as const).map((r) => {
            const label = r === "ALL" ? "전체" : r === "STAFF" ? "운영" : "멘토";
            const active = roleFilter === r;
            return (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => changeRoleFilter(r)}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full border transition-colors",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:bg-muted"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* 폼 (추가 or 수정) — 우측 메인 상단에 통일 */}
        {(showForm || editingTodo) && (
          <TodoForm
            initial={editingTodo ?? undefined}
            initialCategory={editingTodo ? undefined : formCategory}
            staffList={staffList}
            onDone={handleFormDone}
            onCancel={closeForm}
          />
        )}

        {/* 진행 중 (미완료) 목록 */}
        <div className="space-y-2">
          {pending.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground rounded-xl border bg-card">
              <CheckSquare className="h-10 w-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">모든 할 일을 완료했습니다</p>
            </div>
          ) : (
            pending.map(renderTodoRow)
          )}
        </div>

        {/* 완료 목록 (접을 수 있음) */}
        {completed.length > 0 && (
          <div className="space-y-2">
            <button
              onClick={() => setShowCompleted((p) => !p)}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
            >
              {showCompleted ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              완료됨 {completed.length}개
            </button>
            {showCompleted && (
              <div className="space-y-2">
                {completed.map(renderTodoRow)}
              </div>
            )}
          </div>
        )}
      </div>

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
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-line rounded-[14px] shadow-[var(--shadow-pop)] w-full max-w-[560px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-[18px] py-3 border-b border-line-2">
          <span className="text-[13.5px] font-[650] tracking-[-0.015em] text-ink">수정 이력</span>
          <span className="text-[11.5px] text-ink-4 truncate">· {todo.title}</span>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-canvas-2 text-ink-4 hover:text-ink">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-[18px]">
          {loading && <p className="text-[12.5px] text-ink-4 text-center py-6">불러오는 중...</p>}
          {error && <p className="text-[12.5px] text-bad text-center py-6">{error}</p>}
          {versions && (
            <ol className="space-y-3">
              {/* 현재 상태 (라이브) — 초록색 강조 */}
              <li className="rounded-[10px] border border-ok/40 bg-ok-soft p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-[4px] bg-ok text-white">
                    현재
                  </span>
                  <span className="text-[11.5px] font-semibold text-ok-ink">
                    {todo.lastEditorName ?? todo.authorName}
                  </span>
                  <span className="text-[11px] text-ink-4 font-mono tabular-nums ml-auto">
                    {fmtDateTime(todo.lastEditedAt ?? todo.createdAt)}
                  </span>
                </div>
                <p className="text-[12.5px] font-medium text-ink mb-0.5">{todo.title}</p>
                {todo.content && (
                  <p className="text-[11.5px] text-ink-2 whitespace-pre-wrap line-clamp-4">{todo.content}</p>
                )}
                <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1.5 text-[10.5px] text-ink-3">
                  {todo.dueDate && <span>기한 {new Date(todo.dueDate).toLocaleDateString("ko-KR")}</span>}
                  <span>우선 {PRIORITY_LABEL[todo.priority] ?? todo.priority}</span>
                  {todo.assigneeName && <span>담당 {todo.assigneeName}</span>}
                  {todo.category && <span>분류 {todo.category}</span>}
                </div>
              </li>

              {/* 과거 버전들 */}
              {versions.map((v, idx) => {
                const isOriginal = v.version === 1;
                const newer = versions[idx - 1];
                return (
                  <li key={v.id} className="rounded-[10px] border border-line bg-panel-2 p-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={cn(
                        "text-[10px] font-mono uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-[4px]",
                        isOriginal ? "bg-brand-soft text-brand-2" : "bg-canvas-2 text-ink-3"
                      )}>
                        v{v.version}{isOriginal && " · 최초"}
                      </span>
                      <span className="text-[11.5px] font-semibold text-ink">{v.editorName}</span>
                      <span className="text-[11px] text-ink-4 font-mono tabular-nums ml-auto">
                        {fmtDateTime(v.createdAt)}
                      </span>
                    </div>
                    <p className="text-[12.5px] font-medium text-ink mb-0.5">{v.title}</p>
                    {v.content && (
                      <p className="text-[11.5px] text-ink-3 whitespace-pre-wrap line-clamp-4">{v.content}</p>
                    )}
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1.5 text-[10.5px] text-ink-4">
                      {v.dueDate && <span>기한 {new Date(v.dueDate).toLocaleDateString("ko-KR")}</span>}
                      <span>우선 {PRIORITY_LABEL[v.priority] ?? v.priority}</span>
                      {v.assigneeName && <span>담당 {v.assigneeName}</span>}
                      {v.category && <span>분류 {v.category}</span>}
                    </div>
                    {newer && (
                      <div className="mt-2 pt-2 border-t border-line-2 text-[10.5px] text-ink-4">
                        변경: {diffSummary(v, newer)}
                      </div>
                    )}
                  </li>
                );
              })}
              {versions.length === 0 && (
                <li className="text-[11.5px] text-ink-4 text-center py-2">
                  과거 수정 이력이 없습니다
                </li>
              )}
            </ol>
          )}
        </div>
      </div>
    </div>
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
