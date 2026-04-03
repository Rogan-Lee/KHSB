"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDraft } from "@/hooks/use-draft";
import {
  Plus, CheckSquare, Square, Pencil, Trash2, AlertTriangle,
  Calendar, User, ChevronDown, ChevronUp, X, Check, Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { createTodo, updateTodo, deleteTodo, toggleTodo } from "@/actions/todos";
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
  createdAt: Date;
};
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
};

function TodoForm({
  initial, staffList, onDone, onCancel,
}: {
  initial?: Todo;
  staffList: Staff[];
  onDone: (todo: Todo) => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  const draftKey = initial ? `todo-form-edit-${initial.id}` : "todo-form-new";
  const [draft, setDraft, clearDraft] = useDraft<TodoFormDraft>(draftKey, {
    title: initial?.title ?? "",
    content: initial?.content ?? "",
    dueDate: initial?.dueDate ? new Date(initial.dueDate).toISOString().slice(0, 10) : "",
    priority: initial?.priority ?? "NORMAL",
    assigneeId: initial?.assigneeId ?? "",
    assigneeName: initial?.assigneeName ?? "",
    category: initial?.category ?? "",
  });

  const { title, content, dueDate, priority, assigneeId, assigneeName, category } = draft;
  const setTitle = (v: string) => setDraft((d) => ({ ...d, title: v }));
  const setContent = (v: string) => setDraft((d) => ({ ...d, content: v }));
  const setDueDate = (v: string) => setDraft((d) => ({ ...d, dueDate: v }));
  const setPriority = (v: string) => setDraft((d) => ({ ...d, priority: v }));
  const setAssigneeId = (v: string) => setDraft((d) => ({ ...d, assigneeId: v }));
  const setAssigneeName = (v: string) => setDraft((d) => ({ ...d, assigneeName: v }));
  const setCategory = (v: string) => setDraft((d) => ({ ...d, category: v }));

  function handleAssignee(id: string) {
    const staff = staffList.find((s) => s.id === id);
    setDraft((d) => ({ ...d, assigneeId: id, assigneeName: staff?.name ?? "" }));
  }

  function handleSubmit() {
    if (!title.trim()) { toast.error("제목을 입력해주세요"); return; }
    startTransition(async () => {
      try {
        const payload = { title, content, dueDate: dueDate || undefined, priority, assigneeId: assigneeId || undefined, assigneeName: assigneeName || undefined, category: category || undefined };
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
  todo, currentUserId, isPending,
  onToggle, onEdit, onDelete,
}: {
  todo: Todo; currentUserId: string; isPending: boolean;
  onToggle: (id: string) => void; onEdit: (t: Todo) => void; onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const overdue = isOverdue(todo.dueDate, todo.isCompleted);
  const isAuthor = todo.authorId === currentUserId;

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
                <span className="text-[10px] text-muted-foreground/60 ml-auto">{todo.authorName}</span>
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
            {isAuthor && <>
              <button onClick={() => onEdit(todo)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Pencil className="h-3 w-3" /></button>
              <button onClick={() => onDelete(todo.id)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
            </>}
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
export function TodoManager({ initialTodos, staffList, currentUserId, currentUserName, currentUserRole, initialTemplates }: Props) {
  const [todos, setTodos] = useState<Todo[]>(initialTodos);
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const pending = todos.filter((t) => !t.isCompleted);
  const completed = todos.filter((t) => t.isCompleted);
  const overdue = pending.filter((t) => isOverdue(t.dueDate, false));

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
    }
  }

  return (
    <div className="space-y-4">
      {/* 헤더 + KPI */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">투두리스트</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            미완료 {pending.length}개 · 완료 {completed.length}개
            {overdue.length > 0 && <span className="text-red-600 font-semibold ml-2">· 기한 초과 {overdue.length}개</span>}
          </p>
        </div>
        <Button size="sm" onClick={() => { setShowForm(true); setEditingTodo(null); }} className="gap-1.5 h-8">
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

      {/* 폼 (추가 or 수정) */}
      {(showForm || editingTodo) && (
        <TodoForm
          initial={editingTodo ?? undefined}
          staffList={staffList}
          onDone={handleFormDone}
          onCancel={() => { setShowForm(false); setEditingTodo(null); }}
        />
      )}

      {/* 미완료 목록 */}
      <div className="space-y-2">
        {pending.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground rounded-xl border bg-card">
            <CheckSquare className="h-10 w-10 mx-auto mb-2 opacity-20" />
            <p className="text-sm">모든 할 일을 완료했습니다</p>
          </div>
        ) : (
          pending.map((todo) =>
            deleteConfirmId === todo.id ? (
              <div key={todo.id} className="rounded-xl border border-red-200 bg-red-50/60 p-3 flex items-center justify-between gap-2">
                <p className="text-sm text-red-700">삭제하시겠습니까?</p>
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" onClick={() => handleDelete(todo.id)} disabled={isPending} className="h-7 text-xs">삭제</Button>
                  <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(null)} className="h-7 text-xs">취소</Button>
                </div>
              </div>
            ) : (
              <TodoCard
                key={todo.id}
                todo={todo}
                currentUserId={currentUserId}
                isPending={isPending}
                onToggle={handleToggle}
                onEdit={(t) => { setEditingTodo(t); setShowForm(false); }}
                onDelete={setDeleteConfirmId}
              />
            )
          )
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
              {completed.map((todo) => (
                <TodoCard
                  key={todo.id}
                  todo={todo}
                  currentUserId={currentUserId}
                  isPending={isPending}
                  onToggle={handleToggle}
                  onEdit={(t) => { setEditingTodo(t); setShowForm(false); }}
                  onDelete={setDeleteConfirmId}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 루틴 관리 (관리자 전용) */}
      {initialTemplates !== undefined && (
        <div className="rounded-xl border bg-card overflow-hidden mt-6">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
            <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-semibold">루틴 관리</span>
          </div>
          <div className="p-4">
            {currentUserRole === "DIRECTOR" || currentUserRole === "ADMIN" ? (
              <ChecklistManager initialTemplates={initialTemplates} />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">루틴 관리는 관리자만 가능합니다.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
