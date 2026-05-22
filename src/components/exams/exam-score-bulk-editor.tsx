"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
import { CheckCircle2, Circle, Save, ChevronRight, Plus, Check } from "lucide-react";
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
        alert(e instanceof Error ? e.message : "저장 실패");
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
        onClick={() => {
          setActiveStudentId(p.studentId);
          setActiveSubject(null);
        }}
        className={cn(
          "w-full text-left px-3 py-2.5 transition-colors border-l-2",
          isActive
            ? "bg-blue-50 border-blue-500"
            : "hover:bg-muted/40 border-transparent"
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-sm truncate">{p.name}</span>
          {p.seatNumber != null && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              좌석 {p.seatNumber}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-muted-foreground">{p.grade}</span>
          <span
            className={cn(
              "text-[10px] font-medium ml-auto inline-flex items-center gap-0.5",
              complete ? "text-emerald-600" : "text-muted-foreground"
            )}
          >
            {done}/{subjects.length}
            {complete && <CheckCircle2 className="h-3 w-3" />}
          </span>
        </div>
      </button>
    );
  }

  return (
    <div className="space-y-3">
      {/* 상단 액션바 */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-muted-foreground">
          총 응시자 {participants.length}명 · 과목 {subjects.length}개
        </span>
        {savedAt && (
          <span className="text-xs text-emerald-700 inline-flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            {savedAt} 저장됨
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Popover open={addSubjectOpen} onOpenChange={setAddSubjectOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" disabled={addSubjectPending}>
                <Plus className="h-4 w-4 mr-1" />
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
                            <Check className={"mr-2 h-4 w-4 " + (added ? "opacity-100" : "opacity-0")} />
                            {s}
                            {added && (
                              <span className="ml-auto text-[10px] text-muted-foreground">추가됨</span>
                            )}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  ))}
                </CommandList>
              </Command>
              <div className="border-t p-2 flex gap-1">
                <Input
                  value={customSubject}
                  onChange={(e) => setCustomSubject(e.target.value)}
                  placeholder="직접 입력 (카탈로그에 없는 과목)"
                  className="h-8 text-sm"
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
                  variant="outline"
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
            <Save className="h-4 w-4 mr-1" />
            {pending ? "저장 중…" : "전체 저장"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[280px_1fr] gap-3 min-h-[500px]">
        {/* 좌: 응시자 리스트 */}
        <div className="border rounded-md overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between gap-2">
            <span>응시자</span>
            <span className="text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
              {filteredParticipants.length}/{participants.length}명
            </span>
          </div>
          {isExternalMode && (
            <div className="px-2 py-2 border-b bg-background">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="이름 또는 학년 검색"
                className="h-8 text-sm"
              />
            </div>
          )}
          <div className="flex-1 overflow-y-auto divide-y max-h-[600px]">
            {isExternalMode
              ? groupedByGrade.map(([gradeLabel, members]) => (
                  <div key={gradeLabel}>
                    <div className="px-3 py-1.5 bg-muted/30 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider sticky top-0">
                      {gradeLabel} <span className="font-normal normal-case">({members.length}명)</span>
                    </div>
                    <div className="divide-y">
                      {members.map((p) => renderParticipantRow(p))}
                    </div>
                  </div>
                ))
              : filteredParticipants.map((p) => renderParticipantRow(p))}
          </div>
        </div>

        {/* 우: 학생별 과목 입력 카드 */}
        <div className="border rounded-md p-4 bg-background">
          {!activeParticipant ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              좌측에서 응시자를 선택하세요
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="text-lg font-bold">
                    {activeParticipant.name}
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      {activeParticipant.grade}
                      {activeParticipant.seatNumber != null && (
                        <> · 좌석 {activeParticipant.seatNumber}</>
                      )}
                    </span>
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    과목 버튼 클릭 → 원점수/등급/백분위 입력 · 각 필드에서{" "}
                    <kbd className="font-mono bg-muted px-1 rounded">Enter</kbd>로 다음 필드 이동, 백분위에서 Enter 시 저장 + 다음 과목
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
                  disabled={
                    pending ||
                    participants.findIndex((p) => p.studentId === activeStudentId) ===
                      participants.length - 1
                  }
                >
                  저장 & 다음 학생
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>

              {/* 과목 버튼들 */}
              <div className="flex flex-wrap gap-2">
                {subjects.map((s) => {
                  const has = hasValue(values, activeParticipant.studentId, s);
                  const isActiveSubj = activeSubject === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setActiveSubject(s)}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm transition-colors",
                        isActiveSubj
                          ? "border-blue-500 bg-blue-50 text-blue-700 font-medium ring-2 ring-blue-200"
                          : has
                          ? "border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "border-border text-foreground hover:bg-muted"
                      )}
                    >
                      {has ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 opacity-40" />
                      )}
                      {s}
                    </button>
                  );
                })}
              </div>

              {/* 활성 과목 입력 영역 */}
              {activeSubject && (
                <div className="border-2 border-blue-200 rounded-lg p-4 bg-blue-50/30">
                  <div className="flex items-baseline justify-between mb-3">
                    <h4 className="font-semibold text-blue-900">{activeSubject}</h4>
                    <span className="text-[11px] text-muted-foreground">
                      Enter 이동 · Esc 닫기
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">원점수</Label>
                      <Input
                        ref={rawRef}
                        type="number"
                        step="1"
                        min={0}
                        max={200}
                        value={values[cellKey(activeParticipant.studentId, activeSubject, "rawScore")] ?? ""}
                        onChange={(e) =>
                          setCell(activeParticipant.studentId, activeSubject, "rawScore", e.target.value)
                        }
                        onKeyDown={(e) => handleFieldKey(e, "rawScore")}
                        placeholder="예: 92"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">등급</Label>
                      <Input
                        ref={gradeRef}
                        type="number"
                        step="1"
                        min={1}
                        max={9}
                        value={values[cellKey(activeParticipant.studentId, activeSubject, "grade")] ?? ""}
                        onChange={(e) =>
                          setCell(activeParticipant.studentId, activeSubject, "grade", e.target.value)
                        }
                        onKeyDown={(e) => handleFieldKey(e, "grade")}
                        placeholder="1~9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">백분위</Label>
                      <Input
                        ref={pctRef}
                        type="number"
                        step="0.01"
                        min={0}
                        max={100}
                        value={values[cellKey(activeParticipant.studentId, activeSubject, "percentile")] ?? ""}
                        onChange={(e) =>
                          setCell(activeParticipant.studentId, activeSubject, "percentile", e.target.value)
                        }
                        onKeyDown={(e) => handleFieldKey(e, "percentile")}
                        placeholder="0~100"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <Button size="sm" onClick={() => persist(advanceToNextSubject)} disabled={pending}>
                      {pending ? "저장 중…" : "저장 & 다음 과목"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setActiveSubject(null)}>
                      닫기
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        빈 값은 저장하지 않고, 저장 시 이 세션에 연결된 기존 성적을 대체합니다. 저장된 성적은 학생 상세 페이지의 모의고사 추이에 반영됩니다.
      </p>
    </div>
  );
}
