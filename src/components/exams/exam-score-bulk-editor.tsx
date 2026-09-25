"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, FormField, SearchField } from "@/components/backoffice/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Save, ChevronRight, Plus, Check, MousePointerClick } from "lucide-react";
import { toast } from "sonner";
import {
  saveExamSessionScores,
  addSubjectToExamSession,
  BulkScoreRow,
} from "@/actions/exam-sessions";
import { SUBJECT_CATALOG } from "@/lib/exam-seats";

type Participant = {
  studentId: string;
  name: string;
  grade: string;
  // 좌석은 PRIVATE_MOCK(자습실 시험) 일 때만 의미가 있음. 외부 시험(공식 모의·내신)은 null.
  seatNumber: number | null;
};

type ExistingScore = {
  studentId: string;
  subject: string;
  rawScore: number | null;
  grade: number | null;
  percentile: number | null;
  notes: string | null;
};

type FieldKey = "rawScore" | "grade" | "percentile";

type CellKey = string; // `${studentId}|${subject}|${field}`
const cellKey = (sid: string, subj: string, field: FieldKey) => `${sid}|${subj}|${field}`;

function parseNumOrNull(raw: string | undefined): number | null {
  if (!raw || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function hasValue(values: Record<CellKey, string>, sid: string, subj: string): boolean {
  return (
    !!values[cellKey(sid, subj, "rawScore")]?.trim() ||
    !!values[cellKey(sid, subj, "grade")]?.trim() ||
    !!values[cellKey(sid, subj, "percentile")]?.trim()
  );
}

function studentProgress(values: Record<CellKey, string>, sid: string, subjects: string[]): number {
  return subjects.filter((s) => hasValue(values, sid, s)).length;
}

export function ExamScoreBulkEditor({
  sessionId,
  subjects: initialSubjects,
  participants,
  existing,
}: {
  sessionId: string;
  subjects: string[];
  participants: Participant[];
  existing: ExistingScore[];
}) {
  const [pending, startTransition] = useTransition();
  const [subjects, setSubjects] = useState<string[]>(initialSubjects);
  const [addSubjectOpen, setAddSubjectOpen] = useState(false);
  const [addSubjectPending, startAddSubjectTransition] = useTransition();
  const [customSubject, setCustomSubject] = useState("");

  // 서버에서 subjects 가 갱신되면 (예: 다른 화면에서 추가) 로컬 state 도 sync.
  // 기존 입력값 (values) 은 그대로 유지됨 — cellKey 가 subject 를 포함하기 때문.
  useEffect(() => {
    setSubjects(initialSubjects);
  }, [initialSubjects]);

  const initialMap = useMemo(() => {
    const m: Record<CellKey, string> = {};
    for (const e of existing) {
      if (e.rawScore != null) m[cellKey(e.studentId, e.subject, "rawScore")] = String(e.rawScore);
      if (e.grade != null) m[cellKey(e.studentId, e.subject, "grade")] = String(e.grade);
      if (e.percentile != null) m[cellKey(e.studentId, e.subject, "percentile")] = String(e.percentile);
    }
    return m;
  }, [existing]);

  const [values, setValues] = useState<Record<CellKey, string>>(initialMap);
  const [activeStudentId, setActiveStudentId] = useState<string | null>(
    participants[0]?.studentId ?? null
  );
  const [activeSubject, setActiveSubject] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // 좌석 정보가 한 명이라도 없으면 외부 시험 모드로 간주 → 학년 그룹 + 검색 UI 표시.
  const isExternalMode = useMemo(
    () => participants.some((p) => p.seatNumber == null),
    [participants]
  );

  const filteredParticipants = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return participants;
    return participants.filter(
      (p) => p.name.toLowerCase().includes(q) || p.grade.toLowerCase().includes(q)
    );
  }, [participants, query]);

  // 학년별 그룹 (외부 시험 모드에서만 헤더 노출). 학년 등장 순서 유지.
  const groupedByGrade = useMemo(() => {
    const groups = new Map<string, Participant[]>();
    for (const p of filteredParticipants) {
      const key = p.grade || "기타";
      const arr = groups.get(key);
      if (arr) arr.push(p);
      else groups.set(key, [p]);
    }
    return Array.from(groups.entries());
  }, [filteredParticipants]);

  const rawRef = useRef<HTMLInputElement>(null);
  const gradeRef = useRef<HTMLInputElement>(null);
  const pctRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeSubject) {
      setTimeout(() => rawRef.current?.focus(), 0);
    }
  }, [activeSubject, activeStudentId]);

  function setCell(sid: string, subj: string, field: FieldKey, raw: string) {
    setValues((prev) => ({ ...prev, [cellKey(sid, subj, field)]: raw }));
  }

  function rowsPayload(): BulkScoreRow[] {
    return participants.map((p) => ({
      studentId: p.studentId,
      scores: subjects.map((subj) => ({
        subject: subj,
        rawScore: parseNumOrNull(values[cellKey(p.studentId, subj, "rawScore")]),
        grade: parseNumOrNull(values[cellKey(p.studentId, subj, "grade")]),
        percentile: parseNumOrNull(values[cellKey(p.studentId, subj, "percentile")]),
        notes: null,
      })),
    }));
  }

  function persist(then?: () => void) {
    startTransition(async () => {
      try {
        await saveExamSessionScores(sessionId, rowsPayload());
        setSavedAt(new Date().toLocaleTimeString("ko-KR"));
        then?.();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "저장 실패");
      }
    });
  }

  function advanceToNextSubject() {
    if (!activeStudentId || !activeSubject) return;
    const idx = subjects.indexOf(activeSubject);
    if (idx >= 0 && idx < subjects.length - 1) {
      setActiveSubject(subjects[idx + 1]);
    } else {
      setActiveSubject(null);
      const pIdx = participants.findIndex((p) => p.studentId === activeStudentId);
      if (pIdx >= 0 && pIdx < participants.length - 1) {
        setActiveStudentId(participants[pIdx + 1].studentId);
      }
    }
  }

  function handleFieldKey(e: React.KeyboardEvent<HTMLInputElement>, field: FieldKey) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (field === "rawScore") gradeRef.current?.focus();
      else if (field === "grade") pctRef.current?.focus();
      else if (field === "percentile") {
        persist(advanceToNextSubject);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setActiveSubject(null);
    }
  }

  function handleAddSubject(rawSubject: string) {
    const trimmed = rawSubject.trim();
    if (!trimmed) return;
    if (subjects.includes(trimmed)) {
      toast.info(`"${trimmed}" 는 이미 추가된 과목입니다`);
      setAddSubjectOpen(false);
      return;
    }
    startAddSubjectTransition(async () => {
      try {
        const res = await addSubjectToExamSession(sessionId, trimmed);
        setSubjects(res.subjects);
        setCustomSubject("");
        setAddSubjectOpen(false);
        toast.success(`"${trimmed}" 과목이 추가되었습니다`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "과목 추가에 실패했습니다");
      }
    });
  }

  const activeParticipant = participants.find((p) => p.studentId === activeStudentId);

  function renderParticipantRow(p: Participant) {
    const done = studentProgress(values, p.studentId, subjects);
    const isActive = activeStudentId === p.studentId;
    const complete = done === subjects.length && subjects.length > 0;
    return (
      <button
        key={p.studentId}
        type="button"
        aria-current={isActive ? "true" : undefined}
        onClick={() => {
          setActiveStudentId(p.studentId);
          setActiveSubject(null);
        }}
        className={cn(
          "flex w-full items-center gap-x3 px-x4 py-x2_5 text-left transition-colors",
          isActive ? "bg-bg-neutral-weak" : "hover:bg-bg-layer-default-pressed"
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-x1_5">
            <span className={cn("truncate text-fg-neutral", isActive ? "t4-bold" : "t4-medium")}>{p.name}</span>
            <span className="shrink-0 t2-regular text-fg-neutral-subtle">{p.grade}</span>
          </div>
          {p.seatNumber != null && (
            <span className="t2-regular tabular-nums text-fg-neutral-subtle">좌석 {p.seatNumber}</span>
          )}
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-x0_5 t3-medium tabular-nums",
            complete ? "text-fg-positive" : done > 0 ? "text-fg-neutral-muted" : "text-fg-placeholder"
          )}
        >
          {complete && <CheckCircle2 className="size-3.5" aria-hidden />}
          {done}/{subjects.length}
        </span>
      </button>
    );
  }

  const activeIndex = participants.findIndex((p) => p.studentId === activeStudentId);

  return (
    <div className="flex flex-col gap-x4">
      {/* 상단 액션바 */}
      <div className="flex flex-wrap items-center gap-x3">
        <span className="t3-regular tabular-nums text-fg-neutral-subtle">
          응시자 <span className="t3-bold text-fg-neutral">{participants.length}명</span> · 과목{" "}
          <span className="t3-bold text-fg-neutral">{subjects.length}개</span>
        </span>
        {savedAt && (
          <span className="inline-flex items-center gap-x1 t3-medium text-fg-positive" role="status">
            <CheckCircle2 className="size-3.5" aria-hidden />
            {savedAt} 저장됨
          </span>
        )}
        <div className="flex items-center gap-x2 sm:ml-auto">
          <Popover open={addSubjectOpen} onOpenChange={setAddSubjectOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" disabled={addSubjectPending}>
                <Plus />
                {addSubjectPending ? "추가 중…" : "과목 추가"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[340px] p-0" align="end">
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
                              if (added) {
                                setAddSubjectOpen(false);
                                return;
                              }
                              handleAddSubject(s);
                            }}
                            disabled={addSubjectPending}
                          >
                            <Check className={cn("mr-x2 size-4", added ? "opacity-100" : "opacity-0")} />
                            {s}
                            {added && (
                              <span className="ml-auto t2-regular text-fg-neutral-subtle">추가됨</span>
                            )}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  ))}
                </CommandList>
              </Command>
              <div className="flex gap-x1_5 border-t border-stroke-neutral-muted p-x2">
                <Input
                  value={customSubject}
                  onChange={(e) => setCustomSubject(e.target.value)}
                  placeholder="직접 입력 (카탈로그에 없는 과목)"
                  aria-label="과목 직접 입력"
                  className="h-9"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddSubject(customSubject);
                    }
                  }}
                  disabled={addSubjectPending}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => handleAddSubject(customSubject)}
                  disabled={addSubjectPending || !customSubject.trim()}
                >
                  추가
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <Button size="sm" onClick={() => persist()} disabled={pending}>
            <Save />
            {pending ? "저장 중…" : "전체 저장"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x4 lg:min-h-[500px] lg:grid-cols-[280px_1fr]">
        {/* 좌: 응시자 리스트 */}
        <div className="flex flex-col overflow-hidden rounded-r3 border border-stroke-neutral-muted">
          <div className="flex items-center justify-between gap-x2 border-b border-stroke-neutral-muted bg-bg-layer-fill px-x4 py-x2_5">
            <span className="t3-medium text-fg-neutral-subtle">응시자</span>
            <span className="t3-regular tabular-nums text-fg-neutral-subtle">
              {filteredParticipants.length}/{participants.length}명
            </span>
          </div>
          {isExternalMode && (
            <div className="border-b border-stroke-neutral-muted p-x2">
              <SearchField
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="이름 또는 학년 검색"
                aria-label="응시자 검색"
                className="h-9 sm:w-full"
              />
            </div>
          )}
          <div className="max-h-[360px] flex-1 divide-y divide-stroke-neutral-muted overflow-y-auto lg:max-h-[600px]">
            {filteredParticipants.length === 0 ? (
              <p className="px-x4 py-x8 text-center t4-regular text-fg-neutral-subtle">검색 결과가 없어요</p>
            ) : isExternalMode ? (
              groupedByGrade.map(([gradeLabel, members]) => (
                <div key={gradeLabel}>
                  <div className="sticky top-0 z-10 flex items-center gap-x1 bg-bg-layer-fill px-x4 py-x1_5 t2-medium text-fg-neutral-subtle">
                    {gradeLabel}
                    <span className="tabular-nums">{members.length}명</span>
                  </div>
                  <div className="divide-y divide-stroke-neutral-muted">
                    {members.map((p) => renderParticipantRow(p))}
                  </div>
                </div>
              ))
            ) : (
              filteredParticipants.map((p) => renderParticipantRow(p))
            )}
          </div>
        </div>

        {/* 우: 학생별 과목 입력 */}
        <div className="rounded-r3 border border-stroke-neutral-muted p-x5">
          {!activeParticipant ? (
            <EmptyState
              compact
              icon={MousePointerClick}
              title="응시자를 선택하세요"
              description="왼쪽 목록에서 학생을 고르면 과목별 점수를 입력할 수 있어요."
              className="h-full"
            />
          ) : (
            <div className="flex flex-col gap-x5">
              <div className="flex flex-wrap items-start justify-between gap-x3">
                <div className="min-w-0">
                  <h3 className="flex flex-wrap items-baseline gap-x2">
                    <span className="t7-bold text-fg-neutral">{activeParticipant.name}</span>
                    <span className="t4-regular tabular-nums text-fg-neutral-subtle">
                      {activeParticipant.grade}
                      {activeParticipant.seatNumber != null && <> · 좌석 {activeParticipant.seatNumber}</>}
                    </span>
                  </h3>
                  <p className="mt-x1 t3-regular text-fg-neutral-subtle">
                    과목을 누르고 원점수·등급·백분위를 입력하세요.{" "}
                    <kbd className="rounded-r1 bg-bg-neutral-weak px-x1 t2-medium text-fg-neutral-muted">Enter</kbd>로
                    다음 칸, 백분위에서 Enter를 누르면 저장하고 다음 과목으로 넘어가요.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const idx = participants.findIndex((p) => p.studentId === activeStudentId);
                    if (idx >= 0 && idx < participants.length - 1) {
                      persist(() => {
                        setActiveStudentId(participants[idx + 1].studentId);
                        setActiveSubject(null);
                      });
                    }
                  }}
                  disabled={pending || activeIndex === participants.length - 1}
                >
                  저장 & 다음 학생
                  <ChevronRight />
                </Button>
              </div>

              {/* 과목 버튼들 */}
              <div className="flex flex-wrap gap-x2" role="group" aria-label="과목">
                {subjects.map((s) => {
                  const has = hasValue(values, activeParticipant.studentId, s);
                  const isActiveSubj = activeSubject === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={isActiveSubj}
                      onClick={() => setActiveSubject(s)}
                      className={cn(
                        "inline-flex h-9 items-center gap-x1_5 rounded-full px-x3_5 t4-medium transition-colors",
                        isActiveSubj
                          ? "bg-bg-neutral-inverted text-fg-neutral-inverted"
                          : has
                          ? "bg-bg-positive-weak text-fg-positive hover:bg-bg-positive-weak-pressed"
                          : "bg-bg-layer-default text-fg-neutral-muted shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)] hover:bg-bg-layer-default-pressed"
                      )}
                    >
                      {has ? (
                        <CheckCircle2 className="size-4" aria-hidden />
                      ) : (
                        <Circle className="size-4 opacity-40" aria-hidden />
                      )}
                      {s}
                    </button>
                  );
                })}
              </div>

              {/* 활성 과목 입력 영역 */}
              {activeSubject && (
                <div className="rounded-r3 bg-bg-layer-fill p-x4">
                  <div className="mb-x3 flex items-baseline justify-between gap-x2">
                    <h4 className="t5-bold text-fg-neutral">{activeSubject}</h4>
                    <span className="t2-regular text-fg-neutral-subtle">Enter 다음 칸 · Esc 닫기</span>
                  </div>
                  <div className="grid grid-cols-3 gap-x3">
                    <FormField label="원점수" htmlFor="score-raw">
                      <Input
                        id="score-raw"
                        ref={rawRef}
                        type="number"
                        inputMode="numeric"
                        step="1"
                        min={0}
                        max={200}
                        className="tabular-nums"
                        value={values[cellKey(activeParticipant.studentId, activeSubject, "rawScore")] ?? ""}
                        onChange={(e) =>
                          setCell(activeParticipant.studentId, activeSubject, "rawScore", e.target.value)
                        }
                        onKeyDown={(e) => handleFieldKey(e, "rawScore")}
                        placeholder="예: 92"
                      />
                    </FormField>
                    <FormField label="등급" htmlFor="score-grade">
                      <Input
                        id="score-grade"
                        ref={gradeRef}
                        type="number"
                        inputMode="numeric"
                        step="1"
                        min={1}
                        max={9}
                        className="tabular-nums"
                        value={values[cellKey(activeParticipant.studentId, activeSubject, "grade")] ?? ""}
                        onChange={(e) =>
                          setCell(activeParticipant.studentId, activeSubject, "grade", e.target.value)
                        }
                        onKeyDown={(e) => handleFieldKey(e, "grade")}
                        placeholder="1~9"
                      />
                    </FormField>
                    <FormField label="백분위" htmlFor="score-pct">
                      <Input
                        id="score-pct"
                        ref={pctRef}
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min={0}
                        max={100}
                        className="tabular-nums"
                        value={values[cellKey(activeParticipant.studentId, activeSubject, "percentile")] ?? ""}
                        onChange={(e) =>
                          setCell(activeParticipant.studentId, activeSubject, "percentile", e.target.value)
                        }
                        onKeyDown={(e) => handleFieldKey(e, "percentile")}
                        placeholder="0~100"
                      />
                    </FormField>
                  </div>
                  <div className="mt-x4 flex items-center justify-end gap-x2">
                    <Button size="sm" variant="ghost" onClick={() => setActiveSubject(null)}>
                      닫기
                    </Button>
                    <Button size="sm" onClick={() => persist(advanceToNextSubject)} disabled={pending}>
                      {pending ? "저장 중…" : "저장 & 다음 과목"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <p className="t3-regular text-fg-neutral-subtle">
        빈 값은 저장하지 않고, 저장하면 이 세션에 연결된 기존 성적을 대체해요. 저장된 성적은 학생 상세의 모의고사 추이에 반영돼요.
      </p>
    </div>
  );
}
