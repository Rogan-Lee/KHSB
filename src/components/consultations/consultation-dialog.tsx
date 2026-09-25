"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/backoffice/ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DateTimePickerInput } from "@/components/ui/time-picker";
import { createConsultation } from "@/actions/consultations";
import { toast } from "sonner";
import { Plus, Search, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  students: { id: string; name: string; grade: string }[];
}

// ── 학생 검색 Combobox ──────────────────────────────────
function StudentCombobox({
  students,
  value,
  onChange,
}: {
  students: Props["students"];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selected = students.find((s) => s.id === value);

  const filtered = students.filter((s) => {
    const q = query.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.grade.toLowerCase().includes(q);
  });

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input type="hidden" name="studentId" value={value} />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex h-10 w-full items-center justify-between gap-x2 rounded-r2 bg-bg-layer-default px-x3 text-left t4-regular shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)] outline-none transition-shadow focus-visible:shadow-[inset_0_0_0_2px_var(--seed-color-stroke-neutral-contrast)]",
          open && "shadow-[inset_0_0_0_2px_var(--seed-color-stroke-neutral-contrast)]",
          selected ? "text-fg-neutral" : "text-fg-placeholder"
        )}
      >
        <span className="truncate">{selected ? `${selected.name} (${selected.grade})` : "원생 검색..."}</span>
        <ChevronDown className="size-4 shrink-0 text-fg-neutral-subtle" aria-hidden />
      </button>
      {open && (
        <div className="absolute z-50 mt-x1 w-full overflow-hidden rounded-r3 bg-bg-layer-floating shadow-[var(--seed-shadow-s3)]">
          <div className="flex items-center gap-x2 border-b border-stroke-neutral-muted px-x3 py-x2">
            <Search className="size-4 shrink-0 text-fg-neutral-subtle" aria-hidden />
            <input
              autoFocus
              type="text"
              placeholder="이름으로 검색..."
              aria-label="원생 이름 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent t4-regular text-fg-neutral outline-none placeholder:text-fg-placeholder"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-x1_5" role="listbox">
            {filtered.length === 0 ? (
              <p className="px-x4 py-x4 text-center t4-regular text-fg-neutral-subtle">검색 결과가 없어요</p>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="option"
                  aria-selected={value === s.id}
                  onClick={() => { onChange(s.id); setOpen(false); setQuery(""); }}
                  className="flex w-full items-center gap-x2 px-x3 py-x2 text-left t4-regular text-fg-neutral transition-colors hover:bg-bg-layer-floating-pressed"
                >
                  <Check className={cn("size-4 shrink-0 text-fg-brand", value === s.id ? "opacity-100" : "opacity-0")} aria-hidden />
                  <span className="truncate">{s.name} ({s.grade})</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ConsultationDialog({ students }: Props) {
  const [open, setOpen] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    if (!studentId) { toast.error("원생을 선택하세요"); return; }
    startTransition(async () => {
      try {
        await createConsultation(formData);
        toast.success("면담이 등록되었습니다");
        setOpen(false);
        setStudentId("");
      } catch {
        toast.error("저장에 실패했습니다");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setStudentId(""); }}>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden />
          면담 등록
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>원장 면담 등록</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-x4">
          <FormField label="원생" required>
            <StudentCombobox students={students} value={studentId} onChange={setStudentId} />
          </FormField>
          <FormField label="예정 일시">
            <DateTimePickerInput name="scheduledAt" />
          </FormField>
          <FormField label="면담 주제" htmlFor="agenda">
            <Textarea
              id="agenda"
              name="agenda"
              placeholder="면담 주제를 입력하세요..."
              rows={3}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button type="submit" disabled={isPending || !studentId}>
              {isPending ? "저장 중…" : "등록"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
