"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateTimePickerInput } from "@/components/ui/time-picker";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { createConsultation } from "@/actions/consultations";
import { toast } from "sonner";
import { ArrowLeft, Search, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface Props {
  students: { id: string; name: string; grade: string }[];
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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-center justify-between border rounded-lg px-4 py-3 text-sm bg-background hover:bg-accent transition-colors",
          !selected && "text-muted-foreground"
        )}
      >
        <span className="truncate">{selected ? `${selected.name} (${selected.grade})` : "원생을 검색하세요..."}</span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-lg">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              autoFocus
              type="text"
              placeholder="이름으로 검색..."
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

type CType = "STUDENT" | "PARENT";
type CCategory = "ENROLLED" | "NEW_ADMISSION" | "CONSIDERING";

const TYPE_OPTIONS: { value: CType; label: string }[] = [
  { value: "STUDENT", label: "학생 상담" },
  { value: "PARENT", label: "학부모 상담" },
];
const CATEGORY_OPTIONS: { value: CCategory; label: string }[] = [
  { value: "ENROLLED", label: "재원생" },
  { value: "NEW_ADMISSION", label: "신규 입실" },
  { value: "CONSIDERING", label: "등록 고민" },
];

export function NewConsultationForm({ students }: Props) {
  const router = useRouter();
  const [consultType, setConsultType] = useState<CType>("STUDENT");
  const [consultCategory, setConsultCategory] = useState<CCategory>("ENROLLED");
  const [studentId, setStudentId] = useState("");
  const [prospectName, setProspectName] = useState("");
  const [prospectGrade, setProspectGrade] = useState("");
  const [prospectPhone, setProspectPhone] = useState("");
  const [agenda, setAgenda] = useState("");
  const [isPending, startTransition] = useTransition();

  const isRegistered = consultCategory === "ENROLLED";
  const isValid = isRegistered ? !!studentId : !!prospectName.trim();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isValid) {
      toast.error(isRegistered ? "원생을 선택하세요" : "이름을 입력하세요");
      return;
    }

    const fd = new FormData(e.currentTarget);
    fd.set("type", consultType);
    fd.set("category", consultCategory);
    if (isRegistered) {
      fd.set("studentId", studentId);
    } else {
      fd.delete("studentId");
      fd.set("prospectName", prospectName);
      fd.set("prospectGrade", prospectGrade);
      fd.set("prospectPhone", prospectPhone);
    }
    fd.set("agenda", agenda);

    startTransition(async () => {
      try {
        await createConsultation(fd);
        toast.success("면담이 등록되었습니다");
        router.push("/consultations");
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
          href="/consultations"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          면담 목록으로
        </Link>
        <h1 className="text-2xl font-bold">원장 면담 등록</h1>
        <p className="text-sm text-muted-foreground mt-1">
          면담 일정을 등록하고 주제를 미리 작성할 수 있습니다.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* 상담 유형 + 분류 */}
        <div className="flex flex-wrap items-center gap-4">
          {/* 유형: 학생/학부모 */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">상담 유형</Label>
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 border">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setConsultType(opt.value)}
                  className={cn(
                    "px-4 py-1.5 text-sm font-medium rounded-md transition-colors",
                    consultType === opt.value ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 분류: 재원생/신규 입실/등록 고민 */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">상담 분류</Label>
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 border">
              {CATEGORY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setConsultCategory(opt.value);
                    if (opt.value === "ENROLLED") { setProspectName(""); setProspectGrade(""); setProspectPhone(""); }
                    else { setStudentId(""); }
                  }}
                  className={cn(
                    "px-4 py-1.5 text-sm font-medium rounded-md transition-colors",
                    consultCategory === opt.value ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 원생 & 일시 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {isRegistered ? (
            <div className="space-y-2">
              <Label className="text-sm font-medium">원생</Label>
              <StudentCombobox students={students} value={studentId} onChange={setStudentId} />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">이름 *</Label>
                <Input
                  value={prospectName}
                  onChange={(e) => setProspectName(e.target.value)}
                  placeholder="상담 학생 이름"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">학년</Label>
                  <Input
                    value={prospectGrade}
                    onChange={(e) => setProspectGrade(e.target.value)}
                    placeholder="예: 고2"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">연락처</Label>
                  <Input
                    value={prospectPhone}
                    onChange={(e) => setProspectPhone(e.target.value)}
                    placeholder="학부모 또는 학생"
                  />
                </div>
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-sm font-medium">예정 일시</Label>
            <DateTimePickerInput name="scheduledAt" />
          </div>
        </div>

        {/* 면담 주제 — 마크다운 */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">면담 주제</Label>
          <p className="text-xs text-muted-foreground">마크다운 문법을 지원합니다. 이미지 첨부도 가능합니다.</p>
          <div className="min-h-[300px] border rounded-lg overflow-hidden">
            <MarkdownEditor
              value={agenda}
              onChange={setAgenda}
              placeholder="면담에서 다룰 주제를 자유롭게 작성하세요..."
            />
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex items-center gap-3 pt-4 border-t">
          <Link href="/consultations">
            <Button type="button" variant="outline">취소</Button>
          </Link>
          <Button type="submit" disabled={isPending || !isValid}>
            {isPending ? "저장 중..." : "면담 등록"}
          </Button>
        </div>
      </form>
    </div>
  );
}
