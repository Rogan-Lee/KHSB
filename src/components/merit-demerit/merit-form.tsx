"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useDraft } from "@/hooks/use-draft";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createMeritDemerit } from "@/actions/merit-demerit";
import { MERIT_CATEGORIES, cn } from "@/lib/utils";
import { toast } from "sonner";
import { MessageCircle, Check, Search, X, ChevronDown } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";

type Student = { id: string; name: string; grade: string; seat: string | null };

function StudentMultiCombobox({
  students,
  selectedIds,
  onChange,
}: {
  students: Student[];
  selectedIds: Set<string>;
  onChange: (ids: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? students.filter(
        (s) =>
          s.name.includes(query.trim()) ||
          s.grade.includes(query.trim()) ||
          (s.seat && s.seat.includes(query.trim()))
      )
    : students;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function toggleStudent(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  function handleOpen() {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  const selectedStudents = students.filter((s) => selectedIds.has(s.id));

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        className={cn(
          "flex min-h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background",
          "hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          selectedIds.size === 0 && "text-muted-foreground"
        )}
      >
        <div className="flex flex-wrap gap-1 flex-1">
          {selectedStudents.length > 0 ? (
            selectedStudents.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5 text-xs font-medium"
              >
                {s.seat ? `[${s.seat}] ` : ""}{s.name}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleStudent(s.id); }}
                  className="hover:text-destructive"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))
          ) : (
            <span>원생 선택 (다중 선택 가능)</span>
          )}
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 ml-1" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름 또는 학년 검색..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")}>
                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">검색 결과 없음</p>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleStudent(s.id)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors",
                    selectedIds.has(s.id) && "bg-accent font-medium"
                  )}
                >
                  <div className={cn(
                    "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                    selectedIds.has(s.id) ? "bg-primary border-primary" : "border-input"
                  )}>
                    {selectedIds.has(s.id) && <Check className="h-3 w-3 text-primary-foreground" />}
                  </div>
                  {s.seat && <span className="text-xs font-mono text-muted-foreground shrink-0">[{s.seat}]</span>}
                  <span>{s.name}</span>
                  <span className="text-xs text-muted-foreground">{s.grade}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  students: Student[];
}

interface LastRecord {
  studentName: string;
  type: "MERIT" | "DEMERIT";
  points: number;
  reason: string;
}

export function MeritForm({ students }: Props) {
  const [isPending, startTransition] = useTransition();
  const [lastRecord, setLastRecord] = useState<LastRecord | null>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());

  const [draft, setDraft, clearDraft] = useDraft("merit-form-draft", {
    reason: "",
  });

  function handleSubmit(formData: FormData) {
    if (selectedStudentIds.size === 0) {
      toast.error("원생을 선택해주세요");
      return;
    }

    const type = formData.get("type") as "MERIT" | "DEMERIT";
    const points = Number(formData.get("points"));
    const reason = formData.get("reason") as string;
    const date = formData.get("date") as string;
    const category = formData.get("category") as string;
    const names = [...selectedStudentIds].map((id) => students.find((s) => s.id === id)?.name).filter(Boolean);

    startTransition(async () => {
      try {
        // 선택된 학생별로 개별 생성
        for (const studentId of selectedStudentIds) {
          const fd = new FormData();
          fd.set("studentId", studentId);
          fd.set("type", type);
          fd.set("points", String(points));
          fd.set("reason", reason);
          fd.set("date", date);
          if (category) fd.set("category", category);
          await createMeritDemerit(fd);
        }
        clearDraft();
        setSelectedStudentIds(new Set());
        const label = selectedStudentIds.size > 1 ? `${names[0]} 외 ${selectedStudentIds.size - 1}명` : names[0];
        toast.success(`${label}에게 상벌점이 부여되었습니다`);
        setLastRecord({ studentName: names.join(", ") ?? "", type, points, reason });
      } catch {
        toast.error("저장에 실패했습니다");
      }
    });
  }

  async function handleShare() {
    if (!lastRecord) return;
    const typeLabel = lastRecord.type === "MERIT" ? "상점" : "벌점";
    const text = `[강한선배 관리형 독서실] ${lastRecord.studentName} 학생이 ${typeLabel} ${lastRecord.points}점을 받았습니다.\n사유: ${lastRecord.reason}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${lastRecord.studentName} ${typeLabel} 알림`, text });
      } catch {
        // 사용자 취소
      }
    } else {
      await navigator.clipboard.writeText(text);
      toast.success("메시지가 복사되었습니다. 카카오톡에 붙여넣기 하세요.");
    }
  }

  return (
    <div className="space-y-4">
      <form action={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label>원생</Label>
          <StudentMultiCombobox
            students={students}
            selectedIds={selectedStudentIds}
            onChange={setSelectedStudentIds}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>구분</Label>
            <Select name="type" defaultValue="MERIT">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MERIT">상점</SelectItem>
                <SelectItem value="DEMERIT">벌점</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="points">점수</Label>
            <Input id="points" name="points" type="number" min={1} max={100} defaultValue={1} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>카테고리</Label>
          <Select name="category">
            <SelectTrigger>
              <SelectValue placeholder="카테고리 선택" />
            </SelectTrigger>
            <SelectContent>
              {MERIT_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>날짜</Label>
          <DatePicker name="date" defaultValue={new Date().toISOString().split("T")[0]} required placeholder="날짜 선택" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reason">사유 *</Label>
          <Textarea
          id="reason"
          name="reason"
          required
          placeholder="사유를 입력하세요"
          rows={2}
          value={draft.reason}
          onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value }))}
        />
        </div>

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? "저장 중..." : "부여하기"}
        </Button>
      </form>

      {lastRecord && (
        <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
            <Check className="h-3.5 w-3.5" />
            {lastRecord.studentName} 학생 {lastRecord.type === "MERIT" ? "상점" : "벌점"} {lastRecord.points}점 부여 완료
          </div>
          <Button
            size="sm"
            className="w-full gap-2 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-semibold"
            onClick={handleShare}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            카카오톡으로 학부모에게 알리기
          </Button>
        </div>
      )}
    </div>
  );
}
