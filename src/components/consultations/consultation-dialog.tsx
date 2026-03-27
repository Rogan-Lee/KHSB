"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
        className={cn(
          "w-full flex items-center justify-between border rounded-md px-3 py-2 text-sm bg-background hover:bg-accent transition-colors",
          !selected && "text-muted-foreground"
        )}
      >
        <span className="truncate">{selected ? `${selected.name} (${selected.grade})` : "원생 검색..."}</span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
          <div className="flex items-center gap-2 px-3 py-2 border-b">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              autoFocus
              type="text"
              placeholder="이름으로 검색..."
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
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" />
          면담 등록
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>원장 면담 등록</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>원생</Label>
            <StudentCombobox students={students} value={studentId} onChange={setStudentId} />
          </div>
          <div className="space-y-2">
            <Label>예정 일시</Label>
            <DateTimePickerInput name="scheduledAt" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agenda">면담 주제</Label>
            <Textarea
              id="agenda"
              name="agenda"
              placeholder="면담 주제를 입력하세요..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button type="submit" disabled={isPending || !studentId}>
              {isPending ? "저장 중..." : "등록"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
