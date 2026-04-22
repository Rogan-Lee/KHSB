"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { createExamSession, updateExamSession } from "@/actions/exam-sessions";
import { DEFAULT_SUBJECTS, SUBJECT_PRESETS, SUBJECT_CATALOG } from "@/lib/exam-seats";
import { X, Plus } from "lucide-react";
import { ExamType } from "@/generated/prisma";
import { EXAM_TYPE_LABELS } from "./exam-type-label";

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

  function addCustomSubject() {
    const trimmed = customSubject.trim();
    if (!trimmed) return;
    if (!subjects.includes(trimmed)) setSubjects((prev) => [...prev, trimmed]);
    setCustomSubject("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return alert("시험명을 입력하세요");
    if (subjects.length === 0) return alert("최소 1개 이상의 과목을 선택하세요");

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
        alert(err instanceof Error ? err.message : "저장에 실패했습니다");
      }
    });
  }

  function applyPreset(id: string) {
    const preset = SUBJECT_PRESETS.find((p) => p.id === id);
    if (preset) setSubjects([...preset.subjects]);
  }

  function addSubject(s: string) {
    if (!s) return;
    if (!subjects.includes(s)) setSubjects((prev) => [...prev, s]);
  }

  function removeSubject(s: string) {
    setSubjects((prev) => prev.filter((x) => x !== s));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>시험명</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 2026년 4월 시스모의고사"
            required
          />
        </div>
        <div>
          <Label>시험일</Label>
          <Input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} required />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>시험 종류</Label>
          <Select value={examType} onValueChange={(v) => setExamType(v as ExamType)}>
            <SelectTrigger>
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
        </div>
        <div>
          <Label>대상 룸</Label>
          <Input value="H룸 (고정)" disabled />
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <Label>시험 과목 프리셋 선택</Label>
          <p className="text-[11px] text-muted-foreground mt-0.5 mb-1.5">
            학년/시험 유형에 맞춰 한 번에 세팅할 수 있습니다. 선택 시 아래 과목 목록이 교체됩니다.
          </p>
          <Select onValueChange={applyPreset}>
            <SelectTrigger>
              <SelectValue placeholder="프리셋을 선택하세요 (선택 사항)" />
            </SelectTrigger>
            <SelectContent>
              {SUBJECT_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>개별 과목 추가</Label>
          <div className="flex gap-2 mt-1 flex-wrap">
            <Select onValueChange={(v) => addSubject(v)} value="">
              <SelectTrigger className="max-w-sm">
                <SelectValue placeholder="과목 선택 → 자동 추가" />
              </SelectTrigger>
              <SelectContent>
                {SUBJECT_CATALOG.map((group) => (
                  <div key={group.group}>
                    <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/40">
                      {group.group}
                    </div>
                    {group.items.map((s) => (
                      <SelectItem key={s} value={s} disabled={subjects.includes(s)}>
                        {s}
                        {subjects.includes(s) && <span className="text-muted-foreground ml-2">(추가됨)</span>}
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-1">
              <Input
                value={customSubject}
                onChange={(e) => setCustomSubject(e.target.value)}
                placeholder="직접 입력"
                className="w-40"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomSubject();
                  }
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={addCustomSubject}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <div>
          <Label>선택된 과목 ({subjects.length}개)</Label>
          <div className="flex flex-wrap gap-1.5 mt-1.5 min-h-[40px] p-2 border rounded-md bg-muted/30">
            {subjects.length === 0 ? (
              <span className="text-xs text-muted-foreground self-center">아직 추가된 과목이 없습니다.</span>
            ) : (
              subjects.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border bg-primary/10 border-primary/30 text-primary text-xs"
                >
                  {s}
                  <button
                    type="button"
                    onClick={() => removeSubject(s)}
                    className="ml-0.5 opacity-70 hover:opacity-100"
                    aria-label={`${s} 제거`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      <div>
        <Label>메모 (선택)</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="시험 운영 관련 메모"
          rows={3}
        />
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? "저장 중…" : mode === "create" ? "생성 후 좌석 배치로" : "저장"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          취소
        </Button>
      </div>
    </form>
  );
}
