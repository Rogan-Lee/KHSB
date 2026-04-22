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
import { DEFAULT_SUBJECTS } from "@/lib/exam-seats";
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

  function toggleSubject(s: string) {
    setSubjects((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

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

  const presetSubjects = [...DEFAULT_SUBJECTS, "한국사", "사회", "과학"];

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

      <div>
        <Label>과목</Label>
        <div className="flex flex-wrap gap-2 mt-1">
          {presetSubjects.map((s) => {
            const checked = subjects.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleSubject(s)}
                className={
                  "px-3 py-1.5 rounded-full border text-xs transition-colors " +
                  (checked ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground hover:bg-muted")
                }
              >
                {checked ? "✓ " : ""}
                {s}
              </button>
            );
          })}
          {subjects.filter((s) => !presetSubjects.includes(s)).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleSubject(s)}
              className="px-3 py-1.5 rounded-full border text-xs bg-primary/10 border-primary text-primary"
            >
              ✓ {s}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <Input
            value={customSubject}
            onChange={(e) => setCustomSubject(e.target.value)}
            placeholder="과목 추가 (예: 생활과 윤리)"
            className="max-w-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomSubject();
              }
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={addCustomSubject}>
            추가
          </Button>
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
