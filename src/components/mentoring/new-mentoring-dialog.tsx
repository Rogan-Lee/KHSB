"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
        className={cn(
          "w-full flex items-center justify-between border rounded-md px-3 py-2 text-sm bg-background hover:bg-accent transition-colors",
          !selected && "text-muted-foreground"
        )}
      >
        <span className="truncate">{selected ? formatStudent(selected) : "원생 선택"}</span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
          <div className="flex items-center gap-2 px-3 py-2 border-b">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              autoFocus
              type="text"
              placeholder="이름, 학교로 검색..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">검색 결과 없음</p>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { onChange(s.id); setOpen(false); setQuery(""); }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors text-left",
                    value === s.id && "bg-accent/60"
                  )}
                >
                  <Check className={cn("h-3.5 w-3.5 shrink-0 text-primary", value === s.id ? "opacity-100" : "opacity-0")} />
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
          <Plus className="h-4 w-4 mr-1" />
          멘토링 등록
        </Button>
      </DialogTrigger>
      <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>멘토링 일정 등록</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>원생</Label>
            <StudentCombobox
              students={students}
              value={selectedId}
              onChange={setSelectedId}
            />
          </div>
          <div className="space-y-2">
            <Label>예정 일시</Label>
            <DateTimePickerInput name="scheduledAt" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button type="submit" disabled={isPending || !selectedId}>
              {isPending ? "저장 중..." : "등록"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
