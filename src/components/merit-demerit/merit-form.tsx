"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useDraft } from "@/hooks/use-draft";
import { Button } from "@/components/ui/button";
import { KakaoButton } from "@/components/ui/kakao-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormActions, FormField, Segmented } from "@/components/backoffice/ui";
import { createMeritDemerit } from "@/actions/merit-demerit";
import { MERIT_CATEGORIES, cn } from "@/lib/utils";
import { toast } from "sonner";
import { Check, CheckCircle2, Search, X, ChevronDown } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";

type Student = { id: string; name: string; grade: string; seat: string | null };

// DatePicker(공용)를 폼 입력 규격(높이 40 · SEED TextInput)으로 맞추는 className
const DATE_FIELD_CLASS =
  "h-10 w-full justify-start gap-x2 rounded-r2 border-0 bg-bg-layer-default px-x3 t4-regular text-fg-neutral shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)] hover:bg-bg-layer-default-pressed";

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
      <div
        role="button"
        tabIndex={0}
        onClick={handleOpen}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            handleOpen();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex min-h-10 w-full cursor-pointer items-center justify-between gap-x2 rounded-r2 bg-bg-layer-default px-x3 py-x1_5 text-left t4-regular outline-none transition-shadow",
          open
            ? "shadow-[inset_0_0_0_2px_var(--seed-color-stroke-neutral-contrast)]"
            : "shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)] focus-visible:shadow-[inset_0_0_0_2px_var(--seed-color-stroke-neutral-contrast)]",
        )}
      >
        <div className="flex flex-1 flex-wrap gap-x1">
          {selectedStudents.length > 0 ? (
            selectedStudents.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-x1 rounded-full bg-bg-neutral-weak py-x0_5 pl-x2_5 pr-x1 t3-medium text-fg-neutral"
              >
                {s.seat && <span className="tabular-nums text-fg-neutral-subtle">{s.seat}</span>}
                {s.name}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleStudent(s.id); }}
                  aria-label={`${s.name} 선택 해제`}
                  className="grid size-x5 place-items-center rounded-full text-fg-neutral-subtle transition-colors hover:bg-bg-transparent-pressed hover:text-fg-neutral"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))
          ) : (
            <span className="text-fg-placeholder">원생 선택 (여러 명 가능)</span>
          )}
        </div>
        <ChevronDown className="size-4 shrink-0 text-fg-neutral-subtle" aria-hidden />
      </div>

      {open && (
        <div className="absolute z-50 mt-x1 w-full overflow-hidden rounded-r3 bg-bg-layer-floating shadow-[var(--seed-shadow-s3)]">
          <div className="flex items-center gap-x2 border-b border-stroke-neutral-muted px-x3 py-x2_5">
            <Search className="size-4 shrink-0 text-fg-neutral-subtle" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름·학년·좌석 검색"
              className="flex-1 bg-transparent t4-regular text-fg-neutral outline-none placeholder:text-fg-placeholder"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="검색어 지우기"
                className="text-fg-neutral-subtle transition-colors hover:text-fg-neutral"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <div className="max-h-60 overflow-y-auto p-x1_5" role="listbox" aria-multiselectable>
            {filtered.length === 0 ? (
              <p className="px-x3 py-x3 t4-regular text-fg-neutral-subtle">검색 결과가 없어요</p>
            ) : (
              filtered.map((s) => {
                const on = selectedIds.has(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => toggleStudent(s.id)}
                    className="flex w-full items-center gap-x2_5 rounded-r2 px-x3 py-x2 text-left t4-regular text-fg-neutral transition-colors hover:bg-bg-layer-floating-pressed"
                  >
                    <span
                      className={cn(
                        "grid size-[18px] shrink-0 place-items-center rounded-r1",
                        on
                          ? "bg-bg-neutral-inverted text-fg-neutral-inverted"
                          : "shadow-[inset_0_0_0_1.5px_var(--seed-color-stroke-neutral-weak)]",
                      )}
                    >
                      {on && <Check className="size-3.5" strokeWidth={3} />}
                    </span>
                    {s.seat && (
                      <span className="w-8 shrink-0 t3-regular tabular-nums text-fg-neutral-subtle">{s.seat}</span>
                    )}
                    <span className={cn(on && "t4-medium")}>{s.name}</span>
                    <span className="t3-regular text-fg-neutral-subtle">{s.grade}</span>
                  </button>
                );
              })
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
  const [type, setType] = useState<"MERIT" | "DEMERIT">("MERIT");
  const [category, setCategory] = useState("");

  const [draft, setDraft, clearDraft] = useDraft("merit-form-draft", {
    reason: "",
  });

  function handleSubmit(formData: FormData) {
    if (selectedStudentIds.size === 0) {
      toast.error("원생을 선택해주세요");
      return;
    }

    const points = Number(formData.get("points"));
    const reason = formData.get("reason") as string;
    const date = formData.get("date") as string;
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
        setCategory("");
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
    <div className="flex flex-col gap-x5">
      <form action={handleSubmit} className="flex flex-col gap-x4">
        <FormField
          label="원생"
          required
          hint={selectedStudentIds.size > 0 ? `${selectedStudentIds.size}명 선택됨` : undefined}
        >
          <StudentMultiCombobox
            students={students}
            selectedIds={selectedStudentIds}
            onChange={setSelectedStudentIds}
          />
        </FormField>

        <div className="grid grid-cols-1 gap-x4 sm:grid-cols-2">
          <FormField label="구분" required>
            <Segmented
              aria-label="상점 또는 벌점"
              value={type}
              onChange={(v) => setType(v)}
              options={[
                { value: "MERIT", label: "상점" },
                { value: "DEMERIT", label: "벌점" },
              ]}
            />
          </FormField>
          <FormField label="점수" htmlFor="points" required hint="1~100점">
            <Input id="points" name="points" type="number" min={1} max={100} defaultValue={1} className="tabular-nums" />
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-x4 sm:grid-cols-2">
          <FormField label="카테고리">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="카테고리 선택" />
              </SelectTrigger>
              <SelectContent>
                {MERIT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="날짜" required>
            <DatePicker
              name="date"
              defaultValue={new Date().toISOString().split("T")[0]}
              required
              placeholder="날짜 선택"
              className={DATE_FIELD_CLASS}
            />
          </FormField>
        </div>

        <FormField label="사유" htmlFor="reason" required>
          <Textarea
            id="reason"
            name="reason"
            required
            placeholder="예: 자습 시간 집중도 우수"
            rows={2}
            value={draft.reason}
            onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value }))}
          />
        </FormField>

        <FormActions>
          <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
            {isPending ? "저장 중…" : "부여하기"}
          </Button>
        </FormActions>
      </form>

      {lastRecord && (
        <div className="flex flex-col gap-x3 rounded-r3 bg-bg-positive-weak p-x4">
          <p className="flex items-start gap-x2 t4-medium text-fg-positive">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {lastRecord.studentName} 학생 {lastRecord.type === "MERIT" ? "상점" : "벌점"} {lastRecord.points}점 부여 완료
            </span>
          </p>
          <KakaoButton type="button" size="sm" className="w-full" onClick={handleShare}>
            카카오톡으로 학부모에게 알리기
          </KakaoButton>
        </div>
      )}
    </div>
  );
}
