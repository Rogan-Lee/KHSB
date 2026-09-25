"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMonthlyAward, deleteMonthlyAward } from "@/actions/reports";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, Loader2, ChevronsUpDown, Check } from "lucide-react";
import { FormField, StatusBadge } from "@/components/backoffice/ui";
import { useConfirmDialog } from "@/components/exams/use-confirm-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  year: number;
  month: number;
  awards: {
    id: string;
    category: string;
    description: string | null;
    student: { id: string; name: string; grade: string };
  }[];
  students: { id: string; name: string; grade: string }[];
}

const CATEGORY_LABELS: Record<string, string> = {
  ATTITUDE: "학습 태도 우수자",
  MENTOR_PICK: "멘토 선정 우수자",
  IMPROVEMENT: "진보상",
};

export function MonthlyAwardsManager({ year, month, awards, students }: Props) {
  const router = useRouter();
  const [studentId, setStudentId] = useState("");
  const [category, setCategory] = useState<"ATTITUDE" | "MENTOR_PICK" | "IMPROVEMENT">("ATTITUDE");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirmDialog();
  const selectedStudent = students.find((s) => s.id === studentId);

  async function handleAdd() {
    if (!studentId) {
      toast.error("학생을 선택하세요");
      return;
    }
    setSaving("add");
    try {
      await createMonthlyAward(year, month, category, studentId, description || undefined);
      setStudentId("");
      setDescription("");
      toast.success("시상 추가됨");
      startTransition(() => router.refresh());
    } catch {
      toast.error("추가 실패");
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete(id: string) {
    const target = awards.find((a) => a.id === id);
    const ok = await confirm({
      title: "이 시상을 삭제할까요?",
      description: target ? `${CATEGORY_LABELS[target.category]} · ${target.student.name}` : undefined,
      confirmLabel: "삭제",
      destructive: true,
    });
    if (!ok) return;
    setSaving(id);
    try {
      await deleteMonthlyAward(id);
      toast.success("삭제되었습니다");
      startTransition(() => router.refresh());
    } catch {
      toast.error("삭제 실패");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="flex flex-col gap-x4">
      {/* 기존 시상 목록 */}
      {awards.length > 0 ? (
        <ul className="divide-y divide-stroke-neutral-muted overflow-hidden rounded-r3 border border-stroke-neutral-muted">
          {awards.map((a) => (
            <li key={a.id} className="flex items-center gap-x2 py-x2 pl-x4 pr-x2">
              <StatusBadge tone="brand" className="shrink-0">{CATEGORY_LABELS[a.category]}</StatusBadge>
              <div className="min-w-0 flex-1">
                <p className="truncate t4-medium text-fg-neutral">
                  {a.student.name} <span className="t3-regular text-fg-neutral-subtle">{a.student.grade}</span>
                </p>
                {a.description && <p className="truncate t3-regular text-fg-neutral-subtle">{a.description}</p>}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(a.id)}
                disabled={saving === a.id}
                className="size-x8 text-fg-neutral-subtle hover:text-fg-critical"
                aria-label={`${a.student.name} 시상 삭제`}
              >
                {saving === a.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-r3 bg-bg-layer-fill px-x4 py-x3 text-center t3-regular text-fg-neutral-subtle">
          이달 시상이 아직 없어요
        </p>
      )}

      {/* 추가 폼 */}
      <div className="flex flex-col gap-x3 rounded-r3 bg-bg-layer-fill p-x4">
        <p className="t4-bold text-fg-neutral">새 시상 추가</p>
        <div className="grid grid-cols-1 gap-x2 sm:grid-cols-2">
          <FormField label="부문">
            <Select value={category} onValueChange={(v) => setCategory(v as "ATTITUDE" | "MENTOR_PICK" | "IMPROVEMENT")}>
              <SelectTrigger aria-label="시상 부문">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ATTITUDE">학습 태도 우수자</SelectItem>
                <SelectItem value="MENTOR_PICK">멘토 선정 우수자</SelectItem>
                <SelectItem value="IMPROVEMENT">진보상</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="학생" required>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={pickerOpen}
                  aria-label="학생 선택"
                  className={cn(
                    "w-full justify-between t4-regular",
                    !selectedStudent && "text-fg-placeholder"
                  )}
                >
                  <span className="truncate">
                    {selectedStudent ? `${selectedStudent.name} (${selectedStudent.grade})` : "학생 선택"}
                  </span>
                  <ChevronsUpDown className="text-fg-neutral-subtle" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[260px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="이름/학년 검색…" />
                  <CommandList>
                    <CommandEmpty>일치하는 학생이 없습니다.</CommandEmpty>
                    <CommandGroup>
                      {students.map((s) => (
                        <CommandItem
                          key={s.id}
                          value={`${s.name} ${s.grade}`}
                          onSelect={() => {
                            setStudentId(s.id);
                            setPickerOpen(false);
                          }}
                        >
                          <Check className={cn("mr-x2 size-4", studentId === s.id ? "opacity-100" : "opacity-0")} />
                          {s.name} <span className="ml-x1 text-fg-neutral-subtle">({s.grade})</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </FormField>
        </div>
        <FormField label="사유">
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="사유 (선택)"
            aria-label="시상 사유"
          />
        </FormField>
        <div className="flex justify-end">
          <Button size="sm" onClick={handleAdd} disabled={saving === "add"}>
            {saving === "add" ? <Loader2 className="animate-spin" /> : <Plus />}
            {saving === "add" ? "추가 중…" : "시상 추가"}
          </Button>
        </div>
      </div>

      {confirmDialog}
    </div>
  );
}
