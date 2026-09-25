"use client";

import { useState, useTransition, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, inputBaseClass } from "@/components/ui/input";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import {
  Plus,
  Trash2,
  Send,
  Check,
  ChevronDown,
  ChevronUp,
  ListTodo,
  CalendarCheck,
} from "lucide-react";
import { EmptyState, FilterChip, FormActions, StatusBadge } from "@/components/backoffice/ui";
import { CheckRow, ShiftBadge } from "@/components/handover/handover-ui";
import { cn, todayKST } from "@/lib/utils";
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
  days: string;
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

function parseIds(val: string | null): string[] {
  if (!val) return [];
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : [val]; } catch { return [val]; }
}

const DRAFT_KEY = "handover-form-draft";

type SectionId = "content" | "recipients" | "tasks" | "checklist";

export function HandoverForm({ editingHandover, templates, monthlyNotes, staffList, pendingTodos = [], onDone, onCancel }: Props) {
  const [isPending, startTransition] = useTransition();

  // ── Collapsible section state ──
  const [openSections, setOpenSections] = useState<Set<SectionId>>(
    new Set<SectionId>(["content", "recipients", "tasks", "checklist"])
  );

  function toggleSection(id: SectionId) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // 수신자 -- 다중 선택
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
  // 근무 타임 필터 (오픈/마감). null = 미선택(전체 노출)
  const [shift, setShift] = useState<"OPEN" | "CLOSE" | null>(null);
  // 작성일 요일으로 시드 필터 (편집 시엔 스냅샷이 우선이라 무관)
  const todayDow = todayKST().getUTCDay();
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
      .filter((t) => t.isActive && (t.days === "" || t.days.split(",").map(Number).includes(todayDow)))
      .map((t, i) => ({
        templateId: t.id,
        title: t.title,
        shiftType: t.shiftType,
        isChecked: false,
        order: i,
      }));
  });

  // 타임 필터: 공통(ALL)은 항상, 미선택이면 전체, 아니면 해당 타임만
  const shiftMatch = (st: string) => st === "ALL" || shift === null || st === shift;

  const editDraftKey = editingHandover ? `handover-form-edit-${editingHandover.id}` : null;

  // ── localStorage 드래프트 복원 ────────────────────────────────────────────
  useEffect(() => {
    if (editingHandover) {
      if (!editDraftKey) return;
      try {
        const raw = localStorage.getItem(editDraftKey);
        if (raw) {
          const { content, tasks: dt } = JSON.parse(raw);
          if (content !== undefined) setWorkContent(content);
          if (Array.isArray(dt) && dt.length) setTasks(dt.map((t: TaskDraft) => ({ ...t, _key: t._key || crypto.randomUUID() })));
        }
      } catch { /* ignore */ }
    } else {
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (raw) {
          const { content, tasks: dt, checklist: dc } = JSON.parse(raw);
          if (content) setWorkContent(content);
          if (Array.isArray(dt) && dt.length) setTasks(dt.map((t: TaskDraft) => ({ ...t, _key: t._key || crypto.randomUUID() })));
          if (Array.isArray(dc) && dc.length) {
            setChecklist((prev) => prev.map((item) => {
              const found = dc.find((d: { templateId: string; isChecked: boolean }) => d.templateId === item.templateId);
              return found ? { ...item, isChecked: found.isChecked } : item;
            }));
          }
        }
      } catch { /* ignore */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── localStorage 드래프트 저장 ────────────────────────────────────────────
  useEffect(() => {
    try {
      if (editingHandover && editDraftKey) {
        localStorage.setItem(editDraftKey, JSON.stringify({ content: workContent, tasks }));
      } else if (!editingHandover) {
        const existing = localStorage.getItem(DRAFT_KEY);
        const parsed = existing ? JSON.parse(existing) : {};
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...parsed, content: workContent, tasks }));
      }
    } catch { /* ignore */ }
  }, [workContent, tasks, editingHandover, editDraftKey]);

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

    // 편집 시엔 스냅샷 그대로, 신규 시엔 선택 타임에 해당하는 항목만 저장
    const checklistInputs: HandoverChecklistInput[] = checklist
      .filter((c) => editingHandover || shiftMatch(c.shiftType))
      .map((c, i) => ({
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

    // multiple recipients -> store as JSON array
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
        try {
          localStorage.removeItem(DRAFT_KEY);
          if (editDraftKey) localStorage.removeItem(editDraftKey);
        } catch { /* ignore */ }
        onDone();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "저장 실패");
      }
    });
  }

  const visibleCount = checklist.filter((c) => shiftMatch(c.shiftType)).length;
  const checkedCount = checklist.filter((c) => shiftMatch(c.shiftType) && c.isChecked).length;
  const SHIFT_FILTERS = [
    { value: "OPEN" as const, label: "오픈" },
    { value: "CLOSE" as const, label: "마감" },
  ];

  return (
    <div className="flex flex-col gap-x4">

      {/* ── Section 1: 근무 내용 ── */}
      <FormSection
        title="당일 근무 내용"
        description="주요 처리 사항과 학생 이슈를 자유롭게 적어 주세요"
        open={openSections.has("content")}
        onToggle={() => toggleSection("content")}
      >
        <MarkdownEditor
          value={workContent}
          onChange={setWorkContent}
          placeholder="오늘 근무 중 주요 처리 사항, 학생 이슈 등을 자유롭게 작성하세요..."
        />
      </FormSection>

      {/* ── Section 2: 수신 담당자 ── */}
      <FormSection
        title="수신 담당자"
        description="선택한 사람에게 확인 요청이 가요"
        meta={recipients.length > 0 ? <StatusBadge tone="brand">{recipients.length}명</StatusBadge> : undefined}
        open={openSections.has("recipients")}
        onToggle={() => toggleSection("recipients")}
      >
        {staffList.length === 0 ? (
          <p className="t4-regular text-fg-neutral-subtle">선택할 수 있는 직원이 없어요</p>
        ) : (
          <div className="flex flex-wrap gap-x2">
            {staffList.map((s) => {
              const selected = recipients.some((r) => r.id === s.id);
              return (
                <FilterChip key={s.id} selected={selected} onClick={() => toggleRecipient(s)}>
                  {selected && <Check className="size-3.5" aria-hidden />}
                  {s.name}
                </FilterChip>
              );
            })}
          </div>
        )}
      </FormSection>

      {/* ── Section 3: 다음 근무자 할 일 ── */}
      <FormSection
        title="다음 근무자 할 일"
        meta={tasks.length > 0 ? <StatusBadge>{tasks.length}</StatusBadge> : undefined}
        open={openSections.has("tasks")}
        onToggle={() => toggleSection("tasks")}
        action={
          pendingTodos.length > 0 ? (
            <FilterChip
              selected={showTodoImport}
              onClick={() => {
                setShowTodoImport((p) => !p);
                if (!openSections.has("tasks")) toggleSection("tasks");
              }}
            >
              <ListTodo className="size-3.5" aria-hidden />
              내 투두에서 추가
            </FilterChip>
          ) : undefined
        }
      >
        {/* 내 투두 import 패널 */}
        {showTodoImport && pendingTodos.length > 0 && (
          <div className="mb-x4 rounded-r3 bg-bg-layer-fill p-x2">
            <p className="px-x2 pb-x1_5 pt-x1 t3-medium text-fg-neutral-subtle">눌러서 할 일로 추가해요</p>
            <ul className="flex flex-col gap-x1">
              {pendingTodos.map((todo) => (
                <li key={todo.id}>
                  <button
                    type="button"
                    onClick={() => importFromTodo(todo)}
                    className="flex w-full items-center gap-x2 rounded-r2 bg-bg-layer-default px-x3 py-x2 text-left transition-colors hover:bg-bg-layer-default-pressed"
                  >
                    <Plus className="size-4 shrink-0 text-fg-neutral-subtle" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate t4-medium text-fg-neutral">{todo.title}</span>
                      {todo.assigneeName && <span className="block t3-regular text-fg-neutral-subtle">{todo.assigneeName}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 기존 할 일 목록 */}
        {tasks.length > 0 && (
          <ul className="mb-x3 divide-y divide-stroke-neutral-muted overflow-hidden rounded-r3 border border-stroke-neutral-muted">
            {tasks.map((t) => (
              <li key={t._key} className="flex items-center gap-x2 px-x3 py-x2">
                <p className="min-w-0 flex-1 truncate t4-medium text-fg-neutral">{t.title}</p>
                <select
                  value={t.assigneeId}
                  onChange={(e) => {
                    const staff = staffList.find((s) => s.id === e.target.value) ?? null;
                    updateTaskAssignee(t._key, staff);
                  }}
                  aria-label={`${t.title} 담당자`}
                  className={cn(inputBaseClass, "h-8 w-28 shrink-0 px-x2 t3-regular")}
                >
                  <option value="">담당자 없음</option>
                  {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeTask(t._key)}
                  aria-label={`${t.title} 삭제`}
                  className="size-8 hover:text-fg-critical"
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {/* 새 할 일 추가 */}
        <div className="flex flex-col gap-x2 sm:flex-row sm:items-center">
          <Input
            type="text"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            placeholder="할 일을 입력하고 Enter"
            aria-label="새 할 일"
            className="sm:flex-1"
          />
          <div className="flex gap-x2">
            <select
              value={taskAssignee?.id ?? ""}
              onChange={(e) => setTaskAssignee(staffList.find((s) => s.id === e.target.value) ?? null)}
              aria-label="새 할 일 담당자"
              className={cn(inputBaseClass, "h-10 min-w-0 flex-1 sm:w-32 sm:flex-none")}
            >
              <option value="">담당자 없음</option>
              {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <Button type="button" variant="secondary" onClick={addTask} disabled={!taskTitle.trim()}>
              <Plus />
              추가
            </Button>
          </div>
        </div>
      </FormSection>

      {/* ── Section 4: 루틴 체크리스트 ── */}
      <FormSection
        title="루틴 체크리스트"
        meta={
          visibleCount > 0 ? (
            <StatusBadge tone={checkedCount === visibleCount ? "ok" : "gray"}>
              {checkedCount}/{visibleCount}
            </StatusBadge>
          ) : undefined
        }
        open={openSections.has("checklist")}
        onToggle={() => toggleSection("checklist")}
        flush
      >
        {/* 근무 타임 필터 (신규 작성 시) */}
        {!editingHandover && (
          <div className="flex flex-wrap items-center gap-x2 px-x5 pb-x3">
            <span className="t3-medium text-fg-neutral-subtle">근무 타임</span>
            {SHIFT_FILTERS.map((f) => (
              <FilterChip
                key={f.value}
                selected={shift === f.value}
                onClick={() => setShift((prev) => (prev === f.value ? null : f.value))}
              >
                {f.label}
              </FilterChip>
            ))}
          </div>
        )}
        {visibleCount === 0 ? (
          <EmptyState compact icon={CalendarCheck} title="해당 요일·타임의 루틴 항목이 없어요" className="border-t border-stroke-neutral-muted" />
        ) : (
          <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
            {checklist.map((item, i) =>
              shiftMatch(item.shiftType) ? (
                <li key={i}>
                  <CheckRow
                    checked={item.isChecked}
                    onToggle={() => toggleCheck(i)}
                    title={item.title}
                    trailing={<ShiftBadge shiftType={item.shiftType} />}
                  />
                </li>
              ) : null
            )}
          </ul>
        )}
      </FormSection>

      {/* ── 액션 ── */}
      <FormActions className="max-sm:[&>*]:flex-1">
        <Button type="button" variant="secondary" onClick={onCancel}>
          취소
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={isPending}>
          <Send />
          {isPending ? "저장 중…" : editingHandover ? "수정 저장" : "인수인계 저장"}
        </Button>
      </FormActions>
    </div>
  );
}

/** 접을 수 있는 폼 구획 — 머리(제목·메타·접기) + 본문. action 은 접기 버튼 밖에 둔다 */
function FormSection({
  title,
  description,
  meta,
  action,
  open,
  onToggle,
  flush = false,
  children,
}: {
  title: string;
  description?: string;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  flush?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default">
      <div className="flex items-center gap-x2 pr-x3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-x2 rounded-r4 px-x5 py-x4 text-left"
        >
          <span className="min-w-0">
            <span className="flex items-center gap-x2">
              <span className="t6-bold text-fg-neutral">{title}</span>
              {meta}
            </span>
            {description && open && <span className="mt-x0_5 block t4-regular text-fg-neutral-subtle">{description}</span>}
          </span>
        </button>
        {action}
        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? `${title} 접기` : `${title} 펼치기`}
          className="grid size-9 shrink-0 place-items-center rounded-full text-fg-neutral-subtle transition-colors hover:bg-bg-transparent-pressed"
        >
          {open ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
        </button>
      </div>
      {open && <div className={flush ? "overflow-hidden rounded-b-r4" : "px-x5 pb-x5"}>{children}</div>}
    </section>
  );
}
