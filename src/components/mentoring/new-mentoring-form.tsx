"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DateTimePickerInput } from "@/components/ui/time-picker";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { createMentoring } from "@/actions/mentoring";
import { toast } from "sonner";
import { ArrowLeft, Search, Check, ChevronDown } from "lucide-react";
import { cn, parseSchool } from "@/lib/utils";
import Link from "next/link";

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
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-center justify-between border rounded-lg px-4 py-3 text-sm bg-background hover:bg-accent transition-colors",
          !selected && "text-muted-foreground"
        )}
      >
        <span className="truncate">{selected ? formatStudent(selected) : "원생을 검색하세요..."}</span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-lg">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              autoFocus
              type="text"
              placeholder="이름, 학교로 검색..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">검색 결과 없음</p>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { onChange(s.id); setOpen(false); setQuery(""); }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left",
                    value === s.id && "bg-accent/60"
                  )}
                >
                  <Check className={cn("h-4 w-4 shrink-0 text-primary", value === s.id ? "opacity-100" : "opacity-0")} />
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

export function NewMentoringForm({ students }: Props) {
  const router = useRouter();
  const [studentId, setStudentId] = useState("");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!studentId) { toast.error("원생을 선택하세요"); return; }

    const fd = new FormData(e.currentTarget);
    fd.set("studentId", studentId);
    fd.set("notes", notes);

    startTransition(async () => {
      try {
        const result = await createMentoring(fd);
        toast.success("멘토링이 등록되었습니다");
        router.push(`/mentoring/${result.id}`);
      } catch {
        toast.error("저장에 실패했습니다");
      }
    });
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/mentoring"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          멘토링 목록으로
        </Link>
        <h1 className="text-2xl font-bold">멘토링 등록</h1>
        <p className="text-sm text-muted-foreground mt-1">
          멘토링 일정을 등록하고 메모를 미리 작성할 수 있습니다.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* 원생 & 일시 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-sm font-medium">원생</Label>
            <StudentCombobox students={students} value={studentId} onChange={setStudentId} />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">예정 일시</Label>
            <DateTimePickerInput name="scheduledAt" />
          </div>
        </div>

        {/* 메모 — 마크다운 */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">메모</Label>
          <p className="text-xs text-muted-foreground">마크다운 문법을 지원합니다. 이미지 첨부도 가능합니다.</p>
          <div className="min-h-[300px] border rounded-lg overflow-hidden">
            <MarkdownEditor
              value={notes}
              onChange={setNotes}
              placeholder="멘토링 전 메모를 자유롭게 작성하세요..."
            />
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex items-center gap-3 pt-4 border-t">
          <Link href="/mentoring">
            <Button type="button" variant="outline">취소</Button>
          </Link>
          <Button type="submit" disabled={isPending || !studentId}>
            {isPending ? "저장 중..." : "멘토링 등록"}
          </Button>
        </div>
      </form>
    </div>
  );
}
