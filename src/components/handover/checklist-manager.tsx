"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "seed-design/ui/switch";
import { Plus, Trash2, Pencil, CalendarCheck, ListChecks } from "lucide-react";
import { cn, DAY_NAMES, todayKST } from "@/lib/utils";
import {
  EmptyState,
  FilterChip,
  FormActions,
  Section,
  Segmented,
  StatusBadge,
} from "@/components/backoffice/ui";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { ShiftBadge } from "@/components/handover/handover-ui";
import {
  createChecklistTemplate,
  updateChecklistTemplate,
  deleteChecklistTemplate,
} from "@/actions/checklist-templates";

type Template = {
  id: string;
  title: string;
  shiftType: string;
  days: string;
  order: number;
  isActive: boolean;
};

const SHIFT_TYPES = [
  { value: "ALL", label: "공통" },
  { value: "OPEN", label: "오픈" },
  { value: "CLOSE", label: "마감" },
];

// "0,2,5" ↔ [0,2,5]; 빈 값 = 매일
function parseDays(csv: string): number[] {
  return csv ? csv.split(",").map(Number).filter((n) => !Number.isNaN(n)) : [];
}
function daysLabel(csv: string): string {
  const arr = parseDays(csv);
  return arr.length === 0 ? "매일" : arr.sort((a, b) => a - b).map((d) => DAY_NAMES[d]).join("·");
}

function DayChips({ selected, onToggle }: { selected: number[]; onToggle: (d: number) => void }) {
  return (
    <div className="flex flex-wrap gap-x1_5" role="group" aria-label="요일 선택">
      {DAY_NAMES.map((name, d) => {
        const on = selected.includes(d);
        return (
          <button
            key={d}
            type="button"
            onClick={() => onToggle(d)}
            aria-pressed={on}
            className={cn(
              "grid size-9 place-items-center rounded-full t4-medium transition-colors",
              on
                ? "bg-bg-neutral-inverted text-fg-neutral-inverted"
                : "bg-bg-layer-default text-fg-neutral-muted shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)] hover:bg-bg-layer-default-pressed"
            )}
          >
            {name}
          </button>
        );
      })}
    </div>
  );
}

/** 근무 타임 선택 칩 */
function ShiftChips({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-x1_5" role="group" aria-label="근무 타임">
      {SHIFT_TYPES.map((s) => (
        <FilterChip key={s.value} selected={value === s.value} onClick={() => onChange(s.value)}>
          {s.label}
        </FilterChip>
      ))}
    </div>
  );
}

export function ChecklistManager({ initialTemplates, editable = true }: { initialTemplates: Template[]; editable?: boolean }) {
  const [templates, setTemplates] = useState<Template[]>(initialTemplates);
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editShiftType, setEditShiftType] = useState("ALL");
  const [editDays, setEditDays] = useState<number[]>([]);

  // New item form
  const [newTitle, setNewTitle] = useState("");
  const [newShiftType, setNewShiftType] = useState("ALL");
  const [newDays, setNewDays] = useState<number[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  // 삭제 확인
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);

  // 보기 모드: 요일별 개요 / 목록 관리
  const [view, setView] = useState<"byday" | "list">("byday");
  // 요일별 보기에서 선택된 요일 (기본 오늘)
  const [selectedDay, setSelectedDay] = useState<number>(() => todayKST().getUTCDay());

  const toggleDay = (setter: React.Dispatch<React.SetStateAction<number[]>>) => (d: number) =>
    setter((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  function handleAdd() {
    if (!newTitle.trim()) return;
    startTransition(async () => {
      try {
        const created = await createChecklistTemplate({
          title: newTitle.trim(),
          shiftType: newShiftType as "OPEN" | "CLOSE" | "ALL",
          days: newDays.sort((a, b) => a - b).join(","),
        });
        setTemplates((prev) => [...prev, created as Template]);
        setNewTitle("");
        setNewShiftType("ALL");
        setNewDays([]);
        setShowAddForm(false);
        toast.success("항목이 추가되었습니다");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "추가 실패");
      }
    });
  }

  function startEdit(t: Template) {
    setEditingId(t.id);
    setEditTitle(t.title);
    setEditShiftType(t.shiftType);
    setEditDays(parseDays(t.days));
  }

  function handleSaveEdit(id: string) {
    if (!editTitle.trim()) return;
    startTransition(async () => {
      try {
        const updated = await updateChecklistTemplate(id, {
          title: editTitle.trim(),
          shiftType: editShiftType as "OPEN" | "CLOSE" | "ALL",
          days: editDays.sort((a, b) => a - b).join(","),
        });
        setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...(updated as Template) } : t)));
        setEditingId(null);
        toast.success("수정되었습니다");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "수정 실패");
      }
    });
  }

  function handleToggleActive(t: Template) {
    startTransition(async () => {
      try {
        await updateChecklistTemplate(t.id, { isActive: !t.isActive });
        setTemplates((prev) => prev.map((item) => (item.id === t.id ? { ...item, isActive: !item.isActive } : item)));
      } catch {
        toast.error("변경 실패");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteChecklistTemplate(id);
        setTemplates((prev) => prev.filter((t) => t.id !== id));
        setDeleteTarget(null);
        toast.success("삭제되었습니다");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "삭제 실패");
      }
    });
  }

  function openAddForDay(day: number) {
    setNewTitle("");
    setNewShiftType("ALL");
    setNewDays([day]);
    setShowAddForm(true);
  }

  // 추가 폼 (목록/요일별 공용)
  function renderAddForm() {
    return (
      <div className="flex flex-col gap-x4 border-t border-stroke-neutral-muted bg-bg-layer-fill px-x5 py-x4">
        <Input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          autoFocus
          placeholder="루틴 항목 이름"
          aria-label="루틴 항목 이름"
        />
        <div className="flex flex-col gap-x2">
          <p className="t3-medium text-fg-neutral-subtle">근무 타임</p>
          <ShiftChips value={newShiftType} onChange={setNewShiftType} />
        </div>
        <div className="flex flex-col gap-x2">
          <p className="t3-medium text-fg-neutral-subtle">요일 <span className="t3-regular">(선택 안 하면 매일)</span></p>
          <DayChips selected={newDays} onToggle={toggleDay(setNewDays)} />
        </div>
        <FormActions className="pt-0">
          <Button variant="secondary" size="sm" onClick={() => { setShowAddForm(false); setNewTitle(""); }}>
            취소
          </Button>
          <Button size="sm" onClick={handleAdd} disabled={isPending || !newTitle.trim()}>
            {isPending ? "추가하는 중…" : "추가"}
          </Button>
        </FormActions>
      </div>
    );
  }

  // 인라인 편집 폼 (목록/요일별 공용) — key 포함
  function renderEditForm(t: Template) {
    return (
      <li key={t.id} className="flex flex-col gap-x4 bg-bg-layer-fill px-x5 py-x4">
        <Input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSaveEdit(t.id)}
          autoFocus
          aria-label="루틴 항목 이름"
        />
        <div className="flex flex-col gap-x2">
          <p className="t3-medium text-fg-neutral-subtle">근무 타임</p>
          <ShiftChips value={editShiftType} onChange={setEditShiftType} />
        </div>
        <div className="flex flex-col gap-x2">
          <p className="t3-medium text-fg-neutral-subtle">요일 <span className="t3-regular">(선택 안 하면 매일)</span></p>
          <DayChips selected={editDays} onToggle={toggleDay(setEditDays)} />
        </div>
        <FormActions className="pt-0">
          <Button variant="secondary" size="sm" onClick={() => setEditingId(null)}>
            취소
          </Button>
          <Button size="sm" onClick={() => handleSaveEdit(t.id)} disabled={isPending || !editTitle.trim()}>
            {isPending ? "저장 중…" : "저장"}
          </Button>
        </FormActions>
      </li>
    );
  }

  /** 편집·삭제 아이콘 버튼 */
  function rowActions(t: Template) {
    return (
      <div className="flex shrink-0 items-center">
        <Button variant="ghost" size="icon" onClick={() => startEdit(t)} aria-label={`${t.title} 수정`} title="수정" className="size-8">
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setDeleteTarget(t)}
          aria-label={`${t.title} 삭제`}
          title="삭제"
          className="size-8 hover:text-fg-critical"
        >
          <Trash2 />
        </Button>
      </div>
    );
  }

  // ── 요일별 개요 데이터 (활성 항목만) ──
  const todayDow = todayKST().getUTCDay();
  const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 월~일
  const SHIFT_ORDER = ["ALL", "OPEN", "CLOSE"];
  const itemsForDay = (d: number) =>
    templates
      .filter((t) => t.isActive)
      .filter((t) => {
        const days = parseDays(t.days);
        return days.length === 0 || days.includes(d);
      })
      .sort((a, b) => SHIFT_ORDER.indexOf(a.shiftType) - SHIFT_ORDER.indexOf(b.shiftType));

  const effectiveView = editable ? view : "byday";

  return (
    <div className="flex flex-col gap-x4">
      {/* 보기 토글 (관리자만) */}
      {editable && (
        <Segmented
          aria-label="루틴 보기 방식"
          value={view}
          onChange={setView}
          options={[
            { value: "byday", label: "요일별 보기" },
            { value: "list", label: "목록 관리" },
          ]}
          className="sm:w-80"
        />
      )}

      {/* ── 요일별 개요 (요일 선택형) ── */}
      {effectiveView === "byday" && (
        <div className="flex flex-col gap-x4">
          {/* 요일 선택 칩 */}
          <div className="grid grid-cols-7 gap-x1_5" role="group" aria-label="요일">
            {WEEK_ORDER.map((d) => {
              const count = itemsForDay(d).length;
              const isSel = d === selectedDay;
              const isToday = d === todayDow;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSelectedDay(d)}
                  aria-pressed={isSel}
                  aria-label={`${DAY_NAMES[d]}요일 루틴 ${count}개${isToday ? " (오늘)" : ""}`}
                  className={cn(
                    "flex flex-col items-center gap-x0_5 rounded-r3 py-x2 transition-colors",
                    isSel
                      ? "bg-bg-neutral-inverted text-fg-neutral-inverted"
                      : "bg-bg-layer-fill text-fg-neutral-muted hover:bg-bg-neutral-weak"
                  )}
                >
                  <span className={cn("t4-bold", !isSel && isToday && "text-fg-brand")}>{DAY_NAMES[d]}</span>
                  <span className={cn("t2-regular tabular-nums", isSel ? "text-fg-neutral-inverted" : "text-fg-neutral-subtle")}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* 선택 요일 루틴 */}
          {(() => {
            const items = itemsForDay(selectedDay);
            return (
              <Section
                title={
                  <span className="inline-flex items-center gap-x1_5">
                    {DAY_NAMES[selectedDay]}요일
                    {selectedDay === todayDow && <StatusBadge tone="brand">오늘</StatusBadge>}
                  </span>
                }
                description={`활성 루틴 ${items.length}개`}
                actions={
                  editable && !showAddForm ? (
                    <Button variant="secondary" size="sm" onClick={() => openAddForDay(selectedDay)}>
                      <Plus />추가
                    </Button>
                  ) : undefined
                }
                flush
              >
                {editable && showAddForm && renderAddForm()}

                {items.length === 0 ? (
                  <EmptyState
                    compact
                    icon={CalendarCheck}
                    title="이 요일에 등록된 루틴이 없어요"
                    className="border-t border-stroke-neutral-muted"
                  />
                ) : (
                  <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
                    {items.map((t) =>
                      editable && editingId === t.id ? (
                        renderEditForm(t)
                      ) : (
                        <li key={t.id} className="flex items-center gap-x3 px-x5 py-x2_5">
                          <ShiftBadge shiftType={t.shiftType} className="w-10 justify-center" />
                          <span className="min-w-0 flex-1 t4-regular text-fg-neutral">{t.title}</span>
                          {parseDays(t.days).length === 0 && (
                            <span className="shrink-0 t3-regular text-fg-neutral-subtle">매일</span>
                          )}
                          {editable && rowActions(t)}
                        </li>
                      )
                    )}
                  </ul>
                )}
              </Section>
            );
          })()}
        </div>
      )}

      {effectiveView === "list" && (
        <Section
          title="루틴 항목"
          count={templates.length}
          description="비활성화된 항목은 인수인계 작성 시 표시되지 않아요"
          actions={
            !showAddForm ? (
              <Button variant="secondary" size="sm" onClick={() => setShowAddForm(true)}>
                <Plus />항목 추가
              </Button>
            ) : undefined
          }
          flush
        >
          {/* Add form */}
          {showAddForm && renderAddForm()}

          {/* Template list */}
          {templates.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="등록된 루틴 항목이 없어요"
              description="매일 또는 특정 요일에 챙길 일을 루틴으로 등록해 보세요"
              className="border-t border-stroke-neutral-muted"
            />
          ) : (
            <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
              {templates.map((t) =>
                editingId === t.id ? (
                  renderEditForm(t)
                ) : (
                  <li key={t.id} className="flex flex-wrap items-center gap-x3 px-x5 py-x3 sm:flex-nowrap">
                    <span className={cn("min-w-0 flex-1 t4-medium", t.isActive ? "text-fg-neutral" : "text-fg-neutral-subtle line-through")}>
                      {t.title}
                    </span>
                    <div className="flex shrink-0 items-center gap-x1_5">
                      <ShiftBadge shiftType={t.shiftType} />
                      <StatusBadge>{daysLabel(t.days)}</StatusBadge>
                    </div>
                    <div className="flex shrink-0 items-center gap-x2" title={t.isActive ? "비활성화" : "활성화"}>
                      <Switch
                        size="24"
                        checked={t.isActive}
                        disabled={isPending}
                        onCheckedChange={() => handleToggleActive(t)}
                        inputProps={{ "aria-label": `${t.title} 사용` }}
                      />
                    </div>
                    {rowActions(t)}
                  </li>
                )
              )}
            </ul>
          )}
        </Section>
      )}

      <ConfirmDialog
        open={deleteTarget != null}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        title="이 루틴 항목을 삭제할까요?"
        description={deleteTarget ? `"${deleteTarget.title}" — 삭제하면 되돌릴 수 없어요. 잠시 빼 두려면 목록 관리에서 비활성화해 보세요.` : undefined}
        pendingLabel="삭제하는 중…"
        pending={isPending}
        onConfirm={() => { if (deleteTarget) handleDelete(deleteTarget.id); }}
      />
    </div>
  );
}
