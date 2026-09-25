"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { inputBaseClass } from "@/components/ui/input";
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
import { createMentoring } from "@/actions/mentoring";
import { toast } from "sonner";
import { Plus, Search, Check, ChevronDown } from "lucide-react";
import { cn, parseSchool } from "@/lib/utils";

interface Props {
  students: { id: string; name: string; grade: string; school: string | null }[];
}

function formatStudent(s: Props["students"][0]) {
  const school = s.school ? parseSchool(s.school) : "";
  const gradeLabel = /^\d+$/.test(s.grade) ? `${s.grade}학년` : s.grade;
  return school ? `${s.name} · ${school} ${gradeLabel}` : `${s.name} · ${gradeLabel}`;
}

const PLACEHOLDER = "원생 선택";

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
    return (
      s.name.toLowerCase().includes(q) ||
      (s.school ?? "").toLowerCase().includes(q) ||
      s.grade.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          inputBaseClass,
          "flex h-10 items-center justify-between text-left hover:bg-bg-layer-default-pressed",
          !selected && "text-fg-placeholder"
        )}
      >
        <span className="truncate">{selected ? formatStudent(selected) : PLACEHOLDER}</span>
        <ChevronDown className="ml-x2 size-4 shrink-0 text-fg-neutral-subtle" aria-hidden />
      </button>
      {open && (
        <div className="absolute z-50 mt-x1 w-full overflow-hidden rounded-r3 bg-bg-layer-floating shadow-[var(--seed-shadow-s2)]">
          <div className="flex items-center gap-x2 border-b border-stroke-neutral-muted px-x3 py-x2_5">
            <Search className="size-4 shrink-0 text-fg-neutral-subtle" aria-hidden />
            <input
              autoFocus
              type="text"
              placeholder="이름, 학교로 검색..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="원생 검색"
              className="min-w-0 flex-1 bg-transparent t4-regular text-fg-neutral outline-none placeholder:text-fg-placeholder"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-x1" role="listbox">
            {filtered.length === 0 ? (
              <p className="py-x6 text-center t4-regular text-fg-neutral-subtle">검색 결과가 없어요</p>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="option"
                  aria-selected={value === s.id}
                  onClick={() => { onChange(s.id); setOpen(false); setQuery(""); }}
                  className={cn(
                    "flex w-full items-center gap-x2 px-x3 py-x2_5 text-left t4-regular text-fg-neutral transition-colors hover:bg-bg-layer-floating-pressed",
                    value === s.id && "bg-bg-transparent-selected"
                  )}
                >
                  <Check className={cn("size-4 shrink-0 text-fg-brand", value === s.id ? "opacity-100" : "opacity-0")} aria-hidden />
                  <span className="truncate">{formatStudent(s)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function NewMentoringDialog({ students }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedId) { toast.error("원생을 선택하세요"); return; }
    const formData = new FormData(e.currentTarget);
    formData.set("studentId", selectedId);
    startTransition(async () => {
      try {
        const { id } = await createMentoring(formData);
        toast.success("멘토링이 등록되었습니다");
        setOpen(false);
        setSelectedId("");
        router.push(`/mentoring/${id}`);
      } catch {
        toast.error("저장에 실패했습니다");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSelectedId(""); }}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus />
          멘토링 등록
        </Button>
      </DialogTrigger>
      <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>멘토링 일정 등록</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-x4">
          <FormField label="원생" required>
            <StudentCombobox
              students={students}
              value={selectedId}
              onChange={setSelectedId}
            />
          </FormField>
          <FormField label="예정 일시" required>
            <DateTimePickerInput name="scheduledAt" />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button type="submit" disabled={isPending || !selectedId}>
              {isPending ? "등록 중…" : "등록"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
