"use client";

import { useState, useTransition, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Trash2,
  CheckSquare,
  Square,
  ClipboardList,
  Pencil,
  Send,
  X,
  User,
  Users,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createFullHandover,
  updateFullHandover,
  type HandoverTaskInput,
  type HandoverChecklistInput,
} from "@/actions/handover";

type ChecklistTemplate = {
  id: string;
  title: string;
  shiftType: string;
  order: number;
  isActive: boolean;
};

type MonthlyNote = {
  id: string;
  studentName: string;
  content: string;
  authorName: string;
  createdAt: Date;
};

type Staff = { id: string; name: string; role: string };
type PendingTodo = { id: string; title: string; content: string | null; assigneeId: string | null; assigneeName: string | null };

type TaskDraft = {
  _key: string;
  title: string;
  content: string;
  assigneeId: string;
  assigneeName: string;
};

type ChecklistDraft = {
  templateId?: string;
  title: string;
  shiftType: string;
  isChecked: boolean;
  order: number;
};

type HandoverWithDetails = {
  id: string;
  content: string;
  priority: "URGENT" | "NORMAL";
  category: string | null;
  isPinned: boolean;
  recipientId: string | null;
  recipientName: string | null;
  tasks: { id: string; title: string; content: string; assigneeId: string | null; assigneeName: string | null; order: number }[];
  checklist: { id: string; templateId: string | null; title: string; shiftType: string; isChecked: boolean; order: number }[];
};

interface Props {
  editingHandover?: HandoverWithDetails;
  templates: ChecklistTemplate[];
  monthlyNotes: MonthlyNote[];
  staffList: Staff[];
  pendingTodos?: PendingTodo[];
  onDone: () => void;
  onCancel: () => void;
}

const SHIFT_TYPE_LABEL: Record<string, string> = { OPEN: "오픈", CLOSE: "마감", ALL: "공통" };
const SHIFT_TYPE_COLOR: Record<string, string> = {
  OPEN: "bg-blue-50 text-blue-700 border-blue-200",
  CLOSE: "bg-purple-50 text-purple-700 border-purple-200",
  ALL: "bg-gray-50 text-gray-600 border-gray-200",
};

function parseIds(val: string | null): string[] {
  if (!val) return [];
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : [val]; } catch { return [val]; }
}

const DRAFT_KEY = "handover-form-draft";

export function HandoverForm({ editingHandover, templates, monthlyNotes, staffList, pendingTodos = [], onDone, onCancel }: Props) {
  const [isPending, startTransition] = useTransition();

  // 수신자 — 다중 선택
  const [recipients, setRecipients] = useState<Staff[]>(() => {
    if (editingHandover?.recipientId) {
      const ids = parseIds(editingHandover.recipientId);
      return staffList.filter((s) => ids.includes(s.id));
    }
    return [];
  });

  // Section 1: 당일 근무 내용
  const [workContent, setWorkContent] = useState(editingHandover?.content ?? "");

  const [showTodoImport, setShowTodoImport] = useState(false);

  // Section 2: 다음 근무자 할 일
  const [tasks, setTasks] = useState<TaskDraft[]>(
    editingHandover?.tasks.map((t) => ({
      _key: t.id,
      title: t.title,
      content: t.content,
      assigneeId: t.assigneeId ?? "",
      assigneeName: t.assigneeName ?? "",
    })) ?? []
  );
  const [taskTitle, setTaskTitle] = useState("");
  const [taskAssignee, setTaskAssignee] = useState<Staff | null>(null);

  // Section 3: 루틴 체크리스트
  const [checklist, setChecklist] = useState<ChecklistDraft[]>(() => {
    if (editingHandover?.checklist.length) {
      return editingHandover.checklist.map((c) => ({
        templateId: c.templateId ?? undefined,
        title: c.title,
        shiftType: c.shiftType,
        isChecked: c.isChecked,
        order: c.order,
      }));
    }
    return templates
      .filter((t) => t.isActive)
      .map((t, i) => ({
        templateId: t.id,
        title: t.title,
        shiftType: t.shiftType,
        isChecked: false,
        order: i,
      }));
  });

  // ── localStorage 드래프트 (편집 모드가 아닐 때만) ──────────────────────────
  useEffect(() => {
    if (editingHandover) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const { content, tasks: dt, checklist: dc } = JSON.parse(raw);
        if (content) setWorkContent(content);
        if (Array.isArray(dt) && dt.length) setTasks(dt.map((t: TaskDraft) => ({ ...t, _key: t._key || crypto.randomUUID() })));
        // 루틴 체크 상태 복원 (대시보드에서 체크한 것 반영)
        if (Array.isArray(dc) && dc.length) {
          setChecklist((prev) => prev.map((item) => {
            const found = dc.find((d: { templateId: string; isChecked: boolean }) => d.templateId === item.templateId);
            return found ? { ...item, isChecked: found.isChecked } : item;
          }));
        }
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (editingHandover) return;
    try {
      const existing = localStorage.getItem(DRAFT_KEY);
      const parsed = existing ? JSON.parse(existing) : {};
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        ...parsed,
        content: workContent,
        tasks,
      }));
    } catch { /* ignore */ }
  }, [workContent, tasks, editingHandover]);

  function toggleRecipient(staff: Staff) {
    setRecipients((prev) =>
      prev.some((r) => r.id === staff.id)
        ? prev.filter((r) => r.id !== staff.id)
        : [...prev, staff]
    );
  }

  function addTask() {
    if (!taskTitle.trim()) return;
    setTasks((prev) => [
      ...prev,
      {
        _key: crypto.randomUUID(),
        title: taskTitle.trim(),
        content: "",
        assigneeId: taskAssignee?.id ?? "",
        assigneeName: taskAssignee?.name ?? "",
      },
    ]);
    setTaskTitle("");
    setTaskAssignee(null);
  }

  function importFromTodo(todo: PendingTodo) {
    const alreadyAdded = tasks.some((t) => t.title === todo.title);
    if (alreadyAdded) { toast.error("이미 추가된 할 일입니다"); return; }
    setTasks((prev) => [
      ...prev,
      {
        _key: crypto.randomUUID(),
        title: todo.title,
        content: todo.content ?? "",
        assigneeId: todo.assigneeId ?? "",
        assigneeName: todo.assigneeName ?? "",
      },
    ]);
    toast.success("투두에서 추가되었습니다");
  }

  function updateTaskAssignee(key: string, staff: Staff | null) {
    setTasks((prev) => prev.map((t) => t._key === key
      ? { ...t, assigneeId: staff?.id ?? "", assigneeName: staff?.name ?? "" }
      : t
    ));
  }

  function removeTask(key: string) {
    setTasks((prev) => prev.filter((t) => t._key !== key));
  }

  function toggleCheck(index: number) {
    setChecklist((prev) =>
      prev.map((c, i) => (i === index ? { ...c, isChecked: !c.isChecked } : c))
    );
  }

  function handleSubmit() {
    const taskInputs: HandoverTaskInput[] = tasks.map((t, i) => ({
      title: t.title,
      content: t.content,
      assigneeId: t.assigneeId || undefined,
      assigneeName: t.assigneeName || undefined,
      order: i,
    }));

    const checklistInputs: HandoverChecklistInput[] = checklist.map((c, i) => ({
      templateId: c.templateId,
      title: c.title,
      shiftType: c.shiftType,
      isChecked: c.isChecked,
      order: i,
    }));

    const monthlyNotesSnapshot = monthlyNotes.map((n) => ({
      id: n.id,
      studentName: n.studentName,
      content: n.content,
      authorName: n.authorName,
      createdAt: new Date(n.createdAt).toISOString(),
    }));

    // multiple recipients → store as JSON array
    const recipientId = recipients.length > 0 ? JSON.stringify(recipients.map((r) => r.id)) : undefined;
    const recipientName = recipients.length > 0 ? JSON.stringify(recipients.map((r) => r.name)) : undefined;

    startTransition(async () => {
      try {
        if (editingHandover) {
          await updateFullHandover(editingHandover.id, {
            content: workContent,
            tasks: taskInputs,
            checklist: checklistInputs,
            monthlyNotesSnapshot,
            recipientId: recipientId ?? null,
            recipientName: recipientName ?? null,
          });
          toast.success("인수인계가 수정되었습니다");
        } else {
          await createFullHandover({
            content: workContent,
            tasks: taskInputs,
            checklist: checklistInputs,
            monthlyNotesSnapshot,
            recipientId,
            recipientName,
          });
          toast.success("인수인계가 저장되었습니다");
        }
        try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
        onDone();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "저장 실패");
      }
    });
  }

  const checkedCount = checklist.filter((c) => c.isChecked).length;

  return (
    <div className="space-y-3">
      {/* ── 3-column: 근무내용 | 루틴 체크리스트 | 수신자+할일 ── */}
      <div className="grid grid-cols-3 gap-3 items-stretch">

        {/* Col 1: 당일 근무 내용 */}
        <div className="rounded-xl border bg-card p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Pencil className="h-3.5 w-3.5" />
            당일 근무 내용
          </div>
          <Textarea
            value={workContent}
            onChange={(e) => setWorkContent(e.target.value)}
            placeholder="오늘 근무 중 주요 처리 사항, 학생 이슈 등을 자유롭게 작성하세요..."
            className="resize-none text-sm leading-relaxed flex-1 min-h-[200px]"
          />
        </div>

        {/* Col 2: 루틴 체크리스트 */}
        <div className="rounded-xl border bg-card overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/50 shrink-0">
            <CheckSquare className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold flex-1">루틴 체크리스트</span>
            {checklist.length > 0 && (
              <span className={cn(
                "text-[11px] font-semibold rounded-full px-2 py-0.5 border",
                checkedCount === checklist.length
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-muted text-muted-foreground border-border"
              )}>
                {checkedCount}/{checklist.length}
              </span>
            )}
          </div>
          <div className="px-3 pb-3 pt-2 flex-1">
            {checklist.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">등록된 루틴 항목이 없습니다.</p>
            ) : (
              <div className="space-y-1">
                {checklist.map((item, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleCheck(i)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-all text-left",
                      item.isChecked
                        ? "bg-green-50 border-green-200 text-green-800"
                        : "bg-background border-border hover:bg-muted/40"
                    )}
                  >
                    {item.isChecked ? (
                      <CheckSquare className="h-3.5 w-3.5 text-green-600 shrink-0" />
                    ) : (
                      <Square className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                    <span className={cn("text-xs flex-1 min-w-0 truncate", item.isChecked && "line-through text-green-700")}>
                      {item.title}
                    </span>
                    <span className={cn("text-[10px] border rounded px-1 py-0.5 shrink-0", SHIFT_TYPE_COLOR[item.shiftType] ?? "bg-gray-50")}>
                      {SHIFT_TYPE_LABEL[item.shiftType] ?? item.shiftType}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Col 3: 수신 담당자 + 다음 근무자 할 일 */}
        <div className="flex flex-col gap-2.5">

          {/* 수신 담당자 */}
          <div className="rounded-xl border bg-card p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              수신 담당자
              {recipients.length > 0 && (
                <span className="ml-auto text-[11px] text-primary font-medium">{recipients.length}명</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {staffList.map((s) => {
                const selected = recipients.some((r) => r.id === s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleRecipient(s)}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all",
                      selected
                        ? "bg-primary/10 border-primary/40 text-primary font-medium"
                        : "bg-background border-border text-foreground hover:bg-muted/40"
                    )}
                  >
                    <div className={cn(
                      "h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0",
                      selected ? "bg-primary border-primary" : "border-border"
                    )}>
                      {selected && <Check className="h-2 w-2 text-primary-foreground" />}
                    </div>
                    {s.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 다음 근무자 할 일 */}
          <div className="rounded-xl border bg-card flex-1">
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/50 rounded-t-xl">
              <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold flex-1">다음 근무자 할 일</span>
              {tasks.length > 0 && (
                <span className="text-[11px] font-semibold bg-muted text-muted-foreground border border-border rounded-full px-2 py-0.5">
                  {tasks.length}
                </span>
              )}
              {pendingTodos.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowTodoImport((p) => !p)}
                  className={cn(
                    "text-[10px] font-medium px-2 py-0.5 rounded-full border transition-all",
                    showTodoImport ? "bg-primary/10 border-primary/40 text-primary" : "border-border/60 text-muted-foreground hover:bg-muted/60"
                  )}
                >
                  내 투두에서 추가
                </button>
              )}
            </div>
            {/* 내 투두 import 패널 */}
            {showTodoImport && pendingTodos.length > 0 && (
              <div className="px-3 py-2 border-b bg-muted/20 space-y-1">
                <p className="text-[10px] text-muted-foreground font-medium">클릭해서 할 일로 추가</p>
                {pendingTodos.map((todo) => (
                  <button
                    key={todo.id}
                    type="button"
                    onClick={() => importFromTodo(todo)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border/60 bg-background hover:bg-primary/5 hover:border-primary/30 text-left transition-all"
                  >
                    <Plus className="h-3 w-3 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{todo.title}</p>
                      {todo.assigneeName && <p className="text-[10px] text-muted-foreground">{todo.assigneeName}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
            <div className="px-3 pb-3 pt-2 space-y-2">
              {/* 기존 할 일 목록 */}
              {tasks.map((t) => (
                <div key={t._key} className="bg-muted/40 rounded-lg px-2.5 py-2 flex items-center gap-2">
                  <p className="text-xs font-medium flex-1 min-w-0 truncate">{t.title}</p>
                  <select
                    value={t.assigneeId}
                    onChange={(e) => {
                      const staff = staffList.find((s) => s.id === e.target.value) ?? null;
                      updateTaskAssignee(t._key, staff);
                    }}
                    className="text-[10px] border rounded-full px-1.5 py-0.5 bg-background text-muted-foreground focus:outline-none focus:ring-0 shrink-0 max-w-[80px]"
                  >
                    <option value="">담당자</option>
                    {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <button onClick={() => removeTask(t._key)} className="p-0.5 text-muted-foreground hover:text-red-500 shrink-0">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}

              {/* 새 할 일 추가 */}
              <div className="border rounded-lg bg-background p-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addTask()}
                    placeholder="할 일 추가 (Enter)"
                    className="flex-1 text-xs bg-transparent border-0 focus:outline-none text-foreground placeholder:text-muted-foreground"
                  />
                  <select
                    value={taskAssignee?.id ?? ""}
                    onChange={(e) => setTaskAssignee(staffList.find((s) => s.id === e.target.value) ?? null)}
                    className="text-[10px] border rounded-full px-1.5 py-0.5 bg-background text-muted-foreground focus:outline-none focus:ring-0 shrink-0 max-w-[80px]"
                  >
                    <option value="">담당자</option>
                    {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <Button size="sm" variant="ghost" onClick={addTask} disabled={!taskTitle.trim()} className="h-6 w-6 p-0 shrink-0">
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── 액션 ── */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button onClick={onCancel} className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 flex items-center gap-1.5">
          <X className="h-3.5 w-3.5" />
          취소
        </button>
        <Button onClick={handleSubmit} disabled={isPending} className="gap-1.5">
          <Send className="h-3.5 w-3.5" />
          {editingHandover ? "수정 저장" : "인수인계 저장"}
        </Button>
      </div>
    </div>
  );
}
