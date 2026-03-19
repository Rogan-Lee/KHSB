"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Pencil, Check, X, GripVertical, ToggleLeft, ToggleRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createChecklistTemplate,
  updateChecklistTemplate,
  deleteChecklistTemplate,
} from "@/actions/checklist-templates";

type Template = {
  id: string;
  title: string;
  shiftType: string;
  order: number;
  isActive: boolean;
};

const SHIFT_TYPES = [
  { value: "ALL", label: "공통", color: "bg-gray-100 text-gray-700" },
  { value: "OPEN", label: "오픈", color: "bg-blue-100 text-blue-700" },
  { value: "CLOSE", label: "마감", color: "bg-purple-100 text-purple-700" },
];

export function ChecklistManager({ initialTemplates }: { initialTemplates: Template[] }) {
  const [templates, setTemplates] = useState<Template[]>(initialTemplates);
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editShiftType, setEditShiftType] = useState("ALL");

  // New item form
  const [newTitle, setNewTitle] = useState("");
  const [newShiftType, setNewShiftType] = useState("ALL");
  const [showAddForm, setShowAddForm] = useState(false);

  function handleAdd() {
    if (!newTitle.trim()) return;
    startTransition(async () => {
      try {
        const created = await createChecklistTemplate({
          title: newTitle.trim(),
          shiftType: newShiftType as "OPEN" | "CLOSE" | "ALL",
        });
        setTemplates((prev) => [...prev, created as Template]);
        setNewTitle("");
        setNewShiftType("ALL");
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
  }

  function handleSaveEdit(id: string) {
    if (!editTitle.trim()) return;
    startTransition(async () => {
      try {
        const updated = await updateChecklistTemplate(id, {
          title: editTitle.trim(),
          shiftType: editShiftType as "OPEN" | "CLOSE" | "ALL",
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
        toast.success("삭제되었습니다");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "삭제 실패");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">루틴 항목을 등록·수정·삭제할 수 있습니다. 비활성화된 항목은 인수인계 작성 시 표시되지 않습니다.</p>
        <Button size="sm" variant="outline" onClick={() => setShowAddForm(true)} className="gap-1.5 h-8 text-xs shrink-0">
          <Plus className="h-3.5 w-3.5" />
          항목 추가
        </Button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="border rounded-xl p-4 space-y-3 bg-muted/30">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            autoFocus
            placeholder="루틴 항목 이름"
            className="w-full text-sm bg-transparent border-b border-border pb-1.5 focus:outline-none focus:border-primary/50"
          />
          <div className="flex gap-2">
            {SHIFT_TYPES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setNewShiftType(s.value)}
                className={cn(
                  "text-xs px-3 py-1 rounded-full border transition-all",
                  newShiftType === s.value ? s.color + " border-current font-semibold" : "border-border text-muted-foreground"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleAdd} disabled={isPending || !newTitle.trim()} className="h-7 text-xs gap-1 flex-1">
              <Plus className="h-3 w-3" /> 추가
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setShowAddForm(false); setNewTitle(""); }} className="h-7 text-xs gap-1">
              <X className="h-3 w-3" /> 취소
            </Button>
          </div>
        </div>
      )}

      {/* Template list */}
      {templates.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          등록된 루틴 항목이 없습니다
        </div>
      ) : (
        <div className="space-y-1.5">
          {templates.map((t) =>
            editingId === t.id ? (
              <div key={t.id} className="border rounded-xl p-3 space-y-2.5 bg-background">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveEdit(t.id)}
                  autoFocus
                  className="w-full text-sm bg-transparent border-b border-border pb-1.5 focus:outline-none focus:border-primary/50"
                />
                <div className="flex items-center gap-2">
                  {SHIFT_TYPES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setEditShiftType(s.value)}
                      className={cn(
                        "text-xs px-3 py-1 rounded-full border transition-all",
                        editShiftType === s.value ? s.color + " border-current font-semibold" : "border-border text-muted-foreground"
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={() => handleSaveEdit(t.id)}
                      className="p-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                key={t.id}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all",
                  t.isActive ? "bg-card" : "bg-muted/30 opacity-60"
                )}
              >
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                <span className={cn("text-sm flex-1", !t.isActive && "line-through text-muted-foreground")}>
                  {t.title}
                </span>
                <span className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full shrink-0",
                  SHIFT_TYPES.find((s) => s.value === t.shiftType)?.color ?? "bg-gray-100 text-gray-600"
                )}>
                  {SHIFT_TYPES.find((s) => s.value === t.shiftType)?.label ?? t.shiftType}
                </span>
                <button onClick={() => handleToggleActive(t)} className="p-1 text-muted-foreground hover:text-foreground transition-colors" title={t.isActive ? "비활성화" : "활성화"}>
                  {t.isActive ? <ToggleRight className="h-4 w-4 text-green-500" /> : <ToggleLeft className="h-4 w-4" />}
                </button>
                <button onClick={() => startEdit(t)} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => handleDelete(t.id)} className="p-1 text-muted-foreground hover:text-red-500 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
