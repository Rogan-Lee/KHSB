"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { FormActions, FormField } from "@/components/backoffice/ui";
import { createExamSession, updateExamSession } from "@/actions/exam-sessions";
import { DEFAULT_SUBJECTS, SUBJECT_PRESETS, SUBJECT_CATALOG } from "@/lib/exam-seats";
import { X, Plus, ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExamType } from "@/generated/prisma";
import { EXAM_TYPE_LABELS } from "./exam-type-label";
import { ExamNameAutocomplete } from "./exam-name-autocomplete";

type Initial = {
  id?: string;
  title: string;
  examDate: string; // YYYY-MM-DD
  examType: ExamType;
  subjects: string[];
  notes?: string;
};

export function ExamSessionForm({
  mode,
  initial,
}: {
  mode: "create" | "edit";
  initial?: Initial;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [examDate, setExamDate] = useState(initial?.examDate ?? new Date().toISOString().slice(0, 10));
  const [examType, setExamType] = useState<ExamType>(initial?.examType ?? "OFFICIAL_MOCK");
  const [subjects, setSubjects] = useState<string[]>(initial?.subjects ?? [...DEFAULT_SUBJECTS]);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [customSubject, setCustomSubject] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; subjects?: string }>({});

  function addCustomSubject() {
    const trimmed = customSubject.trim();
    if (!trimmed) return;
    if (!subjects.includes(trimmed)) setSubjects((prev) => [...prev, trimmed]);
    setCustomSubject("");
    setErrors((e) => ({ ...e, subjects: undefined }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setErrors({ title: "시험명을 입력하세요" });
      return;
    }
    if (subjects.length === 0) {
      setErrors({ subjects: "최소 1개 이상의 과목을 선택하세요" });
      return;
    }
    setErrors({});

    startTransition(async () => {
      try {
        if (mode === "create") {
          const created = await createExamSession({
            title,
            examDate,
            examType,
            subjects,
            notes,
          });
          router.push(`/exams/${created.id}`);
        } else if (initial?.id) {
          await updateExamSession(initial.id, {
            title,
            examDate,
            examType,
            subjects,
            notes,
          });
          router.push(`/exams/${initial.id}`);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "저장에 실패했습니다");
      }
    });
  }

  function applyPreset(id: string) {
    const preset = SUBJECT_PRESETS.find((p) => p.id === id);
    if (preset) {
      setSubjects([...preset.subjects]);
      setErrors((e) => ({ ...e, subjects: undefined }));
    }
  }

  function addSubject(s: string) {
    if (!s) return;
    if (!subjects.includes(s)) setSubjects((prev) => [...prev, s]);
    setErrors((e) => ({ ...e, subjects: undefined }));
  }

  function removeSubject(s: string) {
    setSubjects((prev) => prev.filter((x) => x !== s));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-x6">
      {/* 기본 정보 */}
      <div className="grid grid-cols-1 gap-x5 sm:grid-cols-2">
        <FormField label="시험명" htmlFor="exam-title" required error={errors.title}>
          <ExamNameAutocomplete
            id="exam-title"
            value={title}
            onChange={(v) => {
              setTitle(v);
              if (errors.title) setErrors((e) => ({ ...e, title: undefined }));
            }}
            examType={examType}
            placeholder="예: 2026년 4월 시스모의고사"
            required
          />
        </FormField>
        <FormField label="시험일" htmlFor="exam-date" required>
          <Input
            id="exam-date"
            type="date"
            value={examDate}
            onChange={(e) => setExamDate(e.target.value)}
            required
          />
        </FormField>
        <FormField label="시험 종류" htmlFor="exam-type">
          <Select value={examType} onValueChange={(v) => setExamType(v as ExamType)}>
            <SelectTrigger id="exam-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(EXAM_TYPE_LABELS) as ExamType[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {EXAM_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="대상 룸" htmlFor="exam-room" hint="시험 좌석은 H룸에만 배치돼요">
          <Input id="exam-room" value="H룸 (고정)" disabled />
        </FormField>
      </div>

      {/* 과목 */}
      <div className="flex flex-col gap-x5 border-t border-stroke-neutral-muted pt-x6">
        <FormField
          label="과목 프리셋"
          htmlFor="exam-preset"
          hint="학년·시험 유형에 맞춰 한 번에 채워요. 고르면 아래 과목 목록이 바뀌어요."
        >
          <Select onValueChange={applyPreset}>
            <SelectTrigger id="exam-preset">
              <SelectValue placeholder="프리셋 선택 (선택 사항)" />
            </SelectTrigger>
            <SelectContent>
              {SUBJECT_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label={`선택된 과목 ${subjects.length}개`} required error={errors.subjects}>
          <div
            className={cn(
              "flex min-h-12 flex-wrap items-center gap-x1_5 rounded-r3 bg-bg-layer-fill p-x2",
              errors.subjects && "shadow-[inset_0_0_0_1px_var(--seed-color-stroke-critical-solid)]"
            )}
          >
            {subjects.length === 0 ? (
              <span className="px-x2 t4-regular text-fg-placeholder">아직 추가된 과목이 없어요</span>
            ) : (
              subjects.map((s) => (
                <span
                  key={s}
                  className="inline-flex h-8 items-center gap-x0_5 rounded-full bg-bg-layer-default pl-x3 pr-x1 t3-medium text-fg-neutral shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-muted)]"
                >
                  {s}
                  <button
                    type="button"
                    onClick={() => removeSubject(s)}
                    className="grid size-6 place-items-center rounded-full text-fg-neutral-subtle transition-colors hover:bg-bg-transparent-pressed hover:text-fg-neutral"
                    aria-label={`${s} 제거`}
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))
            )}
          </div>
        </FormField>

        <FormField label="과목 추가" hint="목록에 없는 과목은 직접 입력해 추가하세요">
          <div className="flex flex-col gap-x2 sm:flex-row">
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  className="justify-between sm:w-64"
                >
                  과목 검색 후 추가
                  <ChevronsUpDown className="text-fg-neutral-subtle" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[320px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="과목 이름으로 검색…" />
                  <CommandList>
                    <CommandEmpty>일치하는 과목이 없습니다.</CommandEmpty>
                    {SUBJECT_CATALOG.map((group) => (
                      <CommandGroup key={group.group} heading={group.group}>
                        {group.items.map((s) => {
                          const added = subjects.includes(s);
                          return (
                            <CommandItem
                              key={s}
                              value={s}
                              onSelect={() => {
                                if (!added) addSubject(s);
                                setPickerOpen(false);
                              }}
                            >
                              <Check className={cn("mr-x2 size-4", added ? "opacity-100" : "opacity-0")} />
                              {s}
                              {added && <span className="ml-auto t2-regular text-fg-neutral-subtle">추가됨</span>}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <div className="flex flex-1 gap-x2">
              <Input
                value={customSubject}
                onChange={(e) => setCustomSubject(e.target.value)}
                placeholder="직접 입력 (카탈로그에 없는 과목)"
                aria-label="과목 직접 입력"
                className="min-w-0 flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomSubject();
                  }
                }}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={addCustomSubject}
                disabled={!customSubject.trim()}
              >
                <Plus />
                추가
              </Button>
            </div>
          </div>
        </FormField>
      </div>

      <FormField label="메모" htmlFor="exam-notes" className="border-t border-stroke-neutral-muted pt-x6">
        <Textarea
          id="exam-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="시험 운영 관련 메모 (선택)"
          rows={3}
        />
      </FormField>

      <FormActions className="[&>button]:flex-1 sm:[&>button]:flex-none">
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          취소
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "저장 중…" : mode === "create" ? "생성 후 좌석 배치로" : "저장"}
        </Button>
      </FormActions>
    </form>
  );
}
