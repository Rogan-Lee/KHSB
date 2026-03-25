"use client";

import { useState, useTransition, useRef, useEffect } from "react";
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

type Student = { id: string; name: string; grade: string };

function StudentCombobox({
  students,
  value,
  onChange,
}: {
  students: Student[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = students.find((s) => s.id === value);
  const filtered = query.trim()
    ? students.filter(
        (s) =>
          s.name.includes(query.trim()) ||
          s.grade.includes(query.trim())
      )
    : students;

  // 외부 클릭 시 닫기
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

  function handleSelect(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  function handleOpen() {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <div ref={containerRef} className="relative">
      {/* 트리거 버튼 */}
      <button
        type="button"
        onClick={handleOpen}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
          "hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          !selected && "text-muted-foreground"
        )}
      >
        <span>{selected ? `${selected.name} (${selected.grade})` : "원생 선택"}</span>
        <div className="flex items-center gap-1 text-muted-foreground">
          {selected && (
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
              className="hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className="h-4 w-4" />
        </div>
      </button>

      {/* 드롭다운 */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          {/* 검색 입력 */}
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

          {/* 목록 */}
          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">검색 결과 없음</p>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSelect(s.id)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors",
                    s.id === value && "bg-accent font-medium"
                  )}
                >
                  <span>{s.name}</span>
                  <span className="text-xs text-muted-foreground">{s.grade}</span>
                  {s.id === value && <Check className="ml-auto h-3.5 w-3.5" />}
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
  const [selectedStudentId, setSelectedStudentId] = useState("");

  function handleSubmit(formData: FormData) {
    formData.set("studentId", selectedStudentId);
    const type = formData.get("type") as "MERIT" | "DEMERIT";
    const points = Number(formData.get("points"));
    const reason = formData.get("reason") as string;
    const student = students.find((s) => s.id === selectedStudentId);

    if (!selectedStudentId) {
      toast.error("원생을 선택해주세요");
      return;
    }

    startTransition(async () => {
      try {
        await createMeritDemerit(formData);
        toast.success("상벌점이 부여되었습니다");
        if (student) {
          setLastRecord({ studentName: student.name, type, points, reason });
        }
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
          <StudentCombobox
            students={students}
            value={selectedStudentId}
            onChange={setSelectedStudentId}
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
          <Label htmlFor="date">날짜</Label>
          <Input
            id="date"
            name="date"
            type="date"
            defaultValue={new Date().toISOString().split("T")[0]}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reason">사유 *</Label>
          <Textarea id="reason" name="reason" required placeholder="사유를 입력하세요" rows={2} />
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
